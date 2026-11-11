const fs = require('fs'), r = f => fs.readFileSync(__dirname + '/src/' + f, 'utf8');
const out = r('index.tpl.html').replace('/*CSS*/', () => r('style.css')).replace('/*ENGINE*/', () => r('engine.js')).replace('/*STATIONS*/', () => r('stations.js')).replace('/*APP*/', () => r('app.js'));
fs.mkdirSync(__dirname + '/dist', { recursive: true }); fs.writeFileSync(__dirname + '/dist/index.html', out);
console.log('dist/index.html', (out.length / 1024).toFixed(1) + ' kB');
