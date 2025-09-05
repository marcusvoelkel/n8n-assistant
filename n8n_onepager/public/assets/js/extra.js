(function(){
  function smoothTo(id){ try{ var el=document.getElementById(id); if(el){ el.scrollIntoView({behavior:smooth,block:start}); return true; } }catch(e){} return false; }
  document.addEventListener(click, function(e){ var link=e.target && (e.target.closest ? e.target.closest("a[href=#waitlist]") : null); if(link){ e.preventDefault(); if(!smoothTo(waitlist)){ var base=location.pathname.indexOf(/de/)===0 ? /de/ : /; location.assign(base+#waitlist); } } });
  var btn=document.createElement(button); btn.id=to-top; btn.setAttribute(aria-label,Back to top); btn.className=hidden; btn.textContent=u2191;
  btn.addEventListener(click, function(){ window.scrollTo({top:0, behavior:smooth}); });
  function onScroll(){ btn.classList.toggle(hidden, window.scrollY<=500); }
  document.addEventListener(scroll, onScroll, { passive:true });
  if(document.body){ document.body.appendChild(btn); } else { window.addEventListener(DOMContentLoaded, function(){ document.body.appendChild(btn); }); }
})();
