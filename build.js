// Builds index.html = vendored React (from the original) + compiled src/app.jsx
const fs = require('fs'), babel = require('@babel/core');
const head = fs.readFileSync('src/vendor-react.html', 'utf8').trimEnd(); // <head> + vendored React/ReactDOM
const out = babel.transformSync(fs.readFileSync('src/app.jsx', 'utf8'), { presets: [['@babel/preset-react', { runtime: 'classic' }]], comments: false, compact: false }).code;
const html = `${head}
<script>
(function(){
  var root=document.getElementById("root");
  function fail(msg){ root.innerHTML='<div style="font-family:system-ui;padding:20px;max-width:640px;margin:0 auto"><h2 style="margin:0 0 8px">War room couldn\\'t start</h2><pre style="white-space:pre-wrap;background:#FDECEC;border:1px solid #E8A9A9;padding:12px;border-radius:6px;font-size:13px">'+msg+'</pre><p style="color:#5C6470;font-size:14px">Copy this message and paste it back to Claude.</p></div>'; }
  window.addEventListener("error",function(e){ if(!root.children.length) fail(e.message+(e.lineno?" (line "+e.lineno+")":"")); });
  try{
${out}
  }catch(e){ fail(e.message); }
})();
</script></body></html>
`;
fs.writeFileSync('index.html', html);
console.log('index.html', html.length, 'bytes');
