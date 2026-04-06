async function check() {
    console.log("Checking connectivity...");
    
    try {
        const res3000 = await fetch('http://127.0.0.1:3000/health').then(r => r.status).catch(e => e.message);
        console.log("Port 3000 (Dashboard):", res3000);
    } catch (e) {}

    try {
        const res4000 = await fetch('http://127.0.0.1:4000/health').then(r => r.status).catch(e => e.message);
        console.log("Port 4000 (Backend):", res4000);
    } catch (e) {}

    try {
        const res5000 = await fetch('http://127.0.0.1:5000/process-order', { method: 'POST', body: '{}', headers: {'Content-Type': 'application/json'} }).then(r => r.status).catch(e => e.message);
        console.log("Port 5000 (AI):", res5000);
    } catch (e) {}

    try {
        const aiHealth = await fetch('http://127.0.0.1:5000/health').then(r => r.status).catch(e => e.message);
        console.log("AI /health:", aiHealth);
    } catch (e) {}

    try {
        const rushProbe = await fetch('http://127.0.0.1:4000/orders/rush-ocr', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ imageBase64: 'x', mimeType: 'image/jpeg' })
        }).then(r => r.status).catch(e => e.message);
        console.log("Rush OCR route (/orders/rush-ocr):", rushProbe, "(expected 401 without token)");
    } catch (e) {}
}

check();
