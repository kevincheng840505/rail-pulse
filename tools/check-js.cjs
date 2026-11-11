const fs=require('node:fs');const vm=require('node:vm');const cp=require('node:child_process');
for(const dir of ['src','proxy'])for(const file of fs.readdirSync(dir))if(/\.(js|mjs)$/.test(file))cp.execFileSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});
for(const [,script]of fs.readFileSync('index.html','utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(script);
console.log('Source and bundled JavaScript syntax passed');
