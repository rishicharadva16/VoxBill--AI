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
}

check();
