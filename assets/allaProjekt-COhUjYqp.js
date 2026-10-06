import{c as e,n as t,o as n,s as r,t as i}from"./header-B-jsmtY5.js";import{c as a,i as o,n as s,o as c,s as l,t as u}from"./ui-eQLdQ2_6.js";import{n as d}from"./motion-jmiBeWbW.js";import{t as f}from"./transition-BUFcH9qh.js";import{t as p}from"./projects-BDo9w7io.js";/* empty css           */document.documentElement.classList.add(`js`);var m=document.querySelector(`[data-project-grid]`),h=document.querySelector(`[data-filter-empty]`),g=document.querySelectorAll(`[data-filter-tabs] button`);m.innerHTML=p.map(e=>`
  <a class="pcard" href="projekt.html?p=${e.slug}" data-project-link data-cursor="Se projekt ↗" data-status="${e.status}">
    <figure class="pcard__media img-zoom" data-shared>
      <img class="ph" src="${c(e.img,800,1e3)}" srcset="${l(e.img,5/4)}" sizes="(min-width: 900px) 25vw, 50vw" alt="${e.title}, ${e.place}" loading="lazy" decoding="async" />
      <span class="pcard__tag mono">${e.status}</span>
    </figure>
    <div class="pcard__meta">
      <h3>${e.title}</h3>
      <span>${e.category} | ${e.place.split(`,`).pop().trim()}</span>
    </div>
  </a>`).join(``);function _(e){let t=0;m.querySelectorAll(`.pcard`).forEach(n=>{let r=e===`Alla`||n.dataset.status===e;n.style.display=r?``:`none`,r&&t++}),h.hidden=t>0}if(g.forEach(e=>{e.addEventListener(`click`,()=>{g.forEach(t=>{t.classList.toggle(`is-active`,t===e),t.setAttribute(`aria-selected`,t===e?`true`:`false`)}),_(e.dataset.filter)})}),t(),d(),i(),o(),s(),u(),f(),n)document.body.classList.remove(`is-loading`);else{let t=a(document.querySelector(`.shero__title`));e.timeline().fromTo(`[data-hero-media-s]`,{scale:1.05},{scale:1,duration:1.8,ease:`power2.out`},0).fromTo(t,{yPercent:105},{yPercent:0,duration:1.1,ease:`expo.out`,stagger:.09},.2).fromTo(`.shero .eyebrow, .breadcrumb`,{opacity:0,y:16},{opacity:1,y:0,duration:.9,ease:`expo.out`,stagger:.08},.55),document.body.classList.remove(`is-loading`)}document.fonts?.ready.then(()=>r.refresh()),window.addEventListener(`load`,()=>r.refresh());