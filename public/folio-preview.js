import { makeSlide, setImageSizes } from './portfolio.js?v=visual-editor';
try { setImageSizes(await fetch('./folio-image-sizes.json', {cache:'no-store'}).then(r=>r.json())); } catch {}
const root = document.getElementById('preview-root');
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'folio-preview') return;
  const work = event.data.work;
  root.replaceChildren(makeSlide(work));
  for (const [selector, field] of [['.folio-tab__title', 'title'], ['.folio-mag__note > .folio-card__blurb', 'blurb']]) {
    let node = root.querySelector(selector);
    if (!node && field === 'blurb') { node=document.createElement('p');node.className='folio-card__blurb';root.querySelector('.folio-mag__note').prepend(node); }
    node.contentEditable = 'plaintext-only';
    node.setAttribute('role', 'textbox');
    node.setAttribute('aria-label', field === 'title' ? '编辑作品标题' : '编辑作品简介');
    node.addEventListener('input', () => parent.postMessage({type:'folio-edit', id:work.id, field, value:node.innerText}, location.origin));
  }
  root.querySelectorAll('a').forEach(a => a.addEventListener('click', e => e.preventDefault()));
});
parent.postMessage({type:'folio-ready'}, location.origin);
