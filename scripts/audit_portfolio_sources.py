import json, urllib.request, concurrent.futures, re, html, sys
sys.stdout.reconfigure(encoding="utf-8")
from pathlib import Path
works=json.loads(Path('public/works.json').read_text(encoding='utf-8'))
def fetch(w):
    links=w.get('links',[])
    u=next((l['url'] for l in links if l.get('kind')=='github'),w.get('url',''))
    source=u
    if 'github.com/' in u: u='https://api.github.com/repos/'+u.split('github.com/')[1]
    elif 'bilibili.com/video/' in u: u='https://api.bilibili.com/x/web-interface/view?bvid='+u.split('/video/')[1]
    if not u: return {'id':w['id'],'status':'no source'}
    try:
        req=urllib.request.Request(u,headers={'User-Agent':'Mozilla/5.0'})
        s=urllib.request.urlopen(req,timeout=15).read().decode('utf-8')
        if 'api.github' in u: desc=json.loads(s).get('description')
        elif 'api.bilibili' in u: desc=json.loads(s).get('data',{}).get('desc')
        else: desc=' | '.join(html.unescape(x) for x in re.findall(r'<meta[^>]+(?:name|property)=["\'](?:description|og:description)["\'][^>]+content=["\']([^"\']+)',s))
        return {'id':w['id'],'url':source,'description':desc}
    except Exception as e: return {'id':w['id'],'url':source,'error':str(e)}
with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool: result=list(pool.map(fetch,works))
Path('assets/portfolio-source-audit.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(result,ensure_ascii=False,indent=2))
