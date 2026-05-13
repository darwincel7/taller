fetch('http://localhost:3000/api/health').then(r => r.text()).then(console.log).catch(console.error);
