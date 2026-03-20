/**
 * VoxIntentParser
 * Centralized NLP-lite utility for VoxBill voice commands.
 * Handles normalization, synonyms, intent detection, and entity extraction.
 */

window.VoxIntentParser = (() => {

    const FILLER_PHRASES = [
        'please', 'can you', 'show me', 'open the', 'tell me', 'give me',
        'i want to', 'can i see', 'generate the', 'print the', 'share the',
        'whatsapp the', 'send the', 'view the', 'make a', 'create a', 'it is', 'it\'s'
    ];

    const SYNONYMS = {
        bill: ['bill', 'invoice', 'receipt', 'check', 'hisaab'],
        table: ['table number', 'table no', 'table num', 'table', 'mez'],
        paid: ['paid', 'settle', 'close', 'done', 'clear'],
        open: ['open', 'show', 'view', 'see', 'kholo'],
        generate: ['generate', 'create', 'make', 'banayo'],
        print: ['print', 'nikalo'],
        share: ['share', 'send', 'whatsapp', 'bhejo']
    };

    /**
     * Internal: Normalizes text by removing punctuation, extra spaces,
     * and leading filler phrases.
     */
    function normalize(text) {
        let t = text.toLowerCase().trim()
            .replace(/[.,!?'"]/g, '')
            .replace(/\s+/g, ' ');

        // Remove leading fillers repeatedly if they exist
        let changed = true;
        while (changed) {
            changed = false;
            for (const filler of FILLER_PHRASES) {
                if (t.startsWith(filler + ' ')) {
                    t = t.slice(filler.length).trim();
                    changed = true;
                }
            }
        }
        return t;
    }

    /**
     * Internal: Extract table number from text.
     */
    function extractTableNumber(text) {
        // Look for "table 5", "table number 5", etc.
        const tableMatch = text.match(/\btable\s*(?:number|no|num)?\s*(\d+)\b/i);
        if (tableMatch) return parseInt(tableMatch[1]);

        // Fallback: look for any number if the context of "table" exists nearby
        if (text.includes('table') || text.includes('bill') || text.includes('invoice')) {
            const numMatch = text.match(/\b(\d+)\b/);
            if (numMatch) return parseInt(numMatch[1]);
        }
        return null;
    }

    /**
     * Internal: Extract quantity from text.
     */
    function extractQuantity(text) {
        // Matches "2 naan", "add 5", etc.
        const qtyMatch = text.match(/^(\d+)\b/) || text.match(/\b(\d+)\b\s+/);
        return qtyMatch ? parseInt(qtyMatch[1]) : 1;
    }

    /**
     * Internal: Match item name from text using menu data.
     */
    function matchItem(text, menu) {
        if (!menu || !menu.length) return null;
        
        // Remove known nouns like "table", "bill" from item search
        const searchTxt = text.replace(/\btable\s*(?:number|no|num)?\s*(\d+)\b/gi, '')
                              .replace(/\b(\d+)\b/g, '') // remove quantities
                              .trim();

        for (const item of menu) {
            const name = item.name.toLowerCase();
            // Exact match or contains
            if (searchTxt === name || searchTxt.includes(name) || name.includes(searchTxt)) {
                if (searchTxt.length > 2) return item; // avoid tiny accidental matches
            }
        }
        return null;
    }

    /**
     * Detects intent based on keywords and patterns.
     */
    function detectIntent(text, role) {
        const t = text;

        // --- System Commands (Global) ---
        if (t.match(/\b(who are you|your name|tum kaun ho|tame kon cho)\b/)) return 'get_identity';
        if (t.match(/\b(who built you|made you|kisne banaya)\b/)) return 'get_creator';
        if (t.match(/\b(help|commands|batao|madad)\b/)) return 'get_help';
        if (t.match(/\b(switch to|bolo|vaat kar)\s+(hindi|english|gujarati)\b/)) return 'switch_language';

        // --- Manager Commands ---
        const isManager = (role === 'manager');
        
        // Billing intents
        const hasBill = SYNONYMS.bill.some(s => t.includes(s));
        const hasOpen = SYNONYMS.open.some(s => t.includes(s));
        const hasGenerate = SYNONYMS.generate.some(s => t.includes(s));
        const hasPrint = SYNONYMS.print.some(s => t.includes(s));
        const hasShare = SYNONYMS.share.some(s => t.includes(s));
        const hasPaid = SYNONYMS.paid.some(s => t.includes(s));

        if (hasBill) {
            if (hasShare) return 'share_bill';
            if (hasPrint) return 'print_bill';
            if (hasGenerate) return 'generate_bill';
            if (hasOpen) return 'open_bill';
            if (hasPaid) return 'mark_paid';
        }

        if (isManager) {
            if (t.match(/\b(revenue|kamai|dhandho|collection)\b/)) return 'get_revenue';
            if (t.match(/\b(analytics|report|summary|insghts)\b/)) return 'get_analytics';
            if (t.match(/\b(free|available|vacant|khali)\s+tables\b/)) return 'get_available_tables';
            if (t.match(/\b(occupied|booked|busy|bharela)\s+tables\b/)) return 'get_occupied_tables';
        }

        // --- Waiter Commands ---
        const isWaiter = (role === 'waiter');

        if (t.match(/\b(undo|pichla|last action)\b/)) return 'undo';
        if (t.match(/\b(clear|start over|naya|navo)\b/)) return 'clear_order';
        if (t.match(/\b(save|draft|pending)\b/)) return 'save_draft';
        if (t.match(/\b(send|manager|submit|order kardo)\b/)) return 'send_to_manager';
        if (t.match(/\b(repeat|fir se|pacho)\b/)) return 'repeat_order';
        
        // Items (Add/Remove)
        if (t.match(/\b(remove|delete|hatao|kadhi nakh)\b/)) return 'remove_item';
        if (t.match(/\b(add|order|ordered|lelo|mangwao)\b/) || t.match(/^\d+\s+/)) return 'add_item';

        // Fallback for just naming an item
        return 'unknown';
    }

    /**
     * Public API
     */
    return {
        parse: (rawText, role, menu) => {
            const normalized = normalize(rawText);
            const intent = detectIntent(normalized, role);
            
            const entities = {
                tableNumber: extractTableNumber(normalized),
                quantity: extractQuantity(normalized),
                item: matchItem(normalized, menu),
                rawText: rawText,
                normalized: normalized
            };

            // Heuristic: if intent is unknown but we found an item, assume add_item
            let finalIntent = intent;
            if (intent === 'unknown' && entities.item) {
                finalIntent = 'add_item';
            }

            // Role Boundary Logic
            const managerOnly = ['get_revenue', 'get_analytics', 'open_bill', 'generate_bill', 'print_bill', 'mark_paid', 'get_available_tables', 'get_occupied_tables'];
            const waiterOnly = ['add_item', 'remove_item', 'save_draft', 'send_to_manager', 'clear_order'];
            
            let roleValid = true;
            let message = '';

            if (role === 'waiter' && managerOnly.includes(finalIntent)) {
                roleValid = false;
                message = 'This command is available only in manager mode.';
            } else if (role === 'manager' && waiterOnly.includes(finalIntent)) {
                // Technically managers can do everything, but if we are on the dashboard 
                // and say "add 2 naan", it might be better to say "Go to voice order page".
                // But for now, let's allow it or just warn.
                if (!window.location.href.includes('voice.html')) {
                    roleValid = false;
                    message = 'This command is available only on the voice order page.';
                }
            }

            return {
                intent: finalIntent,
                entities: entities,
                roleValid: roleValid,
                message: message
            };
        }
    };

})();
