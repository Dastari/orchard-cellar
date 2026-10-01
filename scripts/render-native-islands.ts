/** v1.0.0 — Native island design review. Open printed URL in the shared browser. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=resolve(root,'output/native-islands-20261001');
await mkdir(output,{recursive:true});
const server=await createServer({root,configFile:false,publicDir:resolve(root,'packages/client/public'),
  server:{host:'0.0.0.0',port:5186,strictPort:true},logLevel:'warn',plugins:[{
    name:'native-island-evidence',configureServer(vite){
      vite.middlewares.use('/__native-evidence',(request,response)=>{
        if(request.method!=='POST'){response.writeHead(405).end();return;}
        let data='';
        request.on('data',chunk=>{data+=chunk;if(data.length>25_000_000)request.destroy();});
        request.on('end',()=>{void(async()=>{
          const value=JSON.parse(data) as {name:string;png?:string;json?:unknown};
          if(!/^(cinderwake|willowharbour|lava-proof)[a-z0-9-]*$/.test(value.name))throw new Error('Invalid evidence name');
          if(value.png)await writeFile(resolve(output,value.name+'.png'),Buffer.from(value.png.replace(/^data:image\/png;base64,/,''),'base64'));
          if(value.json)await writeFile(resolve(output,value.name+'.json'),JSON.stringify(value.json,null,2)+'\n');
          response.writeHead(200).end('saved');
        })().catch(error=>{response.writeHead(400).end(String(error));});});
      });
    },
  }]});
await server.listen();
console.log('Native island review: http://127.0.0.1:5186/scripts/native-island-preview/');
