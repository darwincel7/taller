fetch("http://localhost:3000/api/whatsapp/status").then(r => { console.log(r.status); return r.text() }).then(t => console.log(t));
