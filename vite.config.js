import {defineConfig} from 'vite';
export default defineConfig({base:'./',server:{cors:true},preview:{cors:true},
 plugins:[{name:'production-player-policy',transformIndexHtml(html,context){
  if(context.server||!context.filename.endsWith('player.html'))return html;
  for(const origin of ['http://localhost:*','http://127.0.0.1:*','ws://localhost:*','ws://127.0.0.1:*'])html=html.replaceAll(' '+origin,'');
  return html;
 }}],build:{rollupOptions:{input:{main:'index.html',player:'player.html'}}}});
