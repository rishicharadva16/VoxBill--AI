import json
import re
import os
import difflib
import urllib.request

def load_menu(backend_url=None, token=None):
    """
    Try to load menu from the live backend API first.
    Falls back to local menu.json if backend is unreachable.
    """
    if backend_url and token:
        try:
            req = urllib.request.Request(
                f"{backend_url}/menu",
                headers={
                    'Authorization': f'Bearer {token}',
                    'Content-Type': 'application/json'
                }
            )
            with urllib.request.urlopen(req, timeout=3) as resp:
                data = json.loads(resp.read().decode())
                if data.get('success') and data.get('data'):
                    # Convert array format to dict: {name: price}
                    return {
                        item['name'].lower(): item['price']
                        for item in data['data']
                    }
        except Exception as e:
            print(f"[menu] Backend unreachable, using local menu.json: {e}")

    # Fallback to static file
    filepath = os.path.join(os.path.dirname(__file__), 'menu.json')
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

# Dictionary for converting common word numbers to integers (English + Hindi)
WORD_TO_NUM = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'a': 1, 'an': 1,
    'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'chaar': 4, 'paanch': 5,
    'che': 6, 'chah': 6, 'saat': 7, 'aath': 8, 'nau': 9, 'das': 10
}

# Fix 31: clean_text defined OUTSIDE the loop
def clean_text(t):
    return re.sub(r'\b(and|aur|x)\b', '', t).strip()

def parse_order(text, backend_url=None, token=None):
    menu = load_menu(backend_url=backend_url, token=token)
    text = text.lower()
    menu_items = list(menu.keys())
    
    parsed_items = []
    grand_total = 0
    table_number = None

    # Extract table number (e.g., "table 5" or "meiz 5")
    table_match = re.search(r'\b(table|meiz|no|number)\s*(\d+)\b', text)
    if table_match:
        table_number = int(table_match.group(2))
        # Remove table part from text to avoid confusion with item quantities
        text = text.replace(table_match.group(0), '')
    
    # 1. First, we find all numbers or quantity words in the text using regex
    num_pattern = r'\b(\d+|' + '|'.join(WORD_TO_NUM.keys()) + r')\b'
    matches = list(re.finditer(num_pattern, text))
    
    # If no numbers are found, we can do a simple check for items and default qty to 1
    if not matches:
        cleaned = clean_text(text)
        best_matches = difflib.get_close_matches(cleaned, menu_items, n=1, cutoff=0.4)
        if best_matches:
            matched_item = best_matches[0]
            qty = 1
            price = menu[matched_item]
            total = price * qty
            grand_total += total
            parsed_items.append({
                "item": matched_item,
                "qty": qty,
                "price": price,
                "total": total
            })
        return {
            "items": parsed_items,
            "grandTotal": grand_total
        }

        
    for i, match in enumerate(matches):
        val = match.group(1)
        qty = int(val) if val.isdigit() else WORD_TO_NUM[val]
        
        # Determine the text segment occurring after this number but before the next number
        start_idx = match.end()
        end_idx = matches[i+1].start() if i + 1 < len(matches) else len(text)
        item_text_after = text[start_idx:end_idx].strip()
        
        # Determine the text segment occurring before this number but after the previous number
        prev_end_idx = matches[i-1].end() if i > 0 else 0
        before_idx = match.start()
        item_text_before = text[prev_end_idx:before_idx].strip()
            
        item_text_after = clean_text(item_text_after)
        item_text_before = clean_text(item_text_before)
        
        matched_item = None
        
        if item_text_after:
            # Fix 6: Exact matching (case-insensitive)
            found = False
            for m_item in menu_items:
                if m_item.lower() == item_text_after.lower():
                    matched_item = m_item
                    found = True
                    break
            
        if not matched_item and item_text_before:
            for m_item in menu_items:
                if m_item.lower() == item_text_before.lower():
                    matched_item = m_item
                    break
            
        if matched_item:
            price = menu[matched_item]
            total = price * qty
            grand_total += total
            parsed_items.append({
                "item": matched_item,
                "qty": qty,
                "price": price,
                "total": total
            })

    return {
        "tableNumber": table_number,
        "items": parsed_items,
        "grandTotal": grand_total
    }
