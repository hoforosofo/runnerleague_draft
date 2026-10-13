"""Inspect supplied exports; never turn a name mention or sentiment into skill points."""
import argparse, collections, hashlib, json, re
from pathlib import Path

ALIASES = {
    '김뿡':['김뿡','뿡이'], '뱅':['뱅'], '디디디용':['디디디용','띠용'],
    '마뫄':['마뫄'], '큐베':['큐베','응차'], '엘리':['엘리'], '설백':['설백'],
    '정령왕':['정령왕','령왕'], '꼴랑이':['꼴랑이','남제','NJ'], '뀨냥냥':['뀨냥냥'],
    '양아지':['양아지'], '남봉':['남봉'], '아야츠노 유니':['유니'], '인섹':['인섹'],
    '눈꽃':['눈꽃'], '임나은':['임나은','나은'], '삐부':['삐부'], '서넹':['서넹'],
    '담유이':['담유이'], '새담':['새담'],
}
CONTEXT = re.compile(r'러너리그|오버워치|옵치|내전|드래프트|드랲|멘딜|섭딜|메인딜|힐러|탱커|솜브라|벤데타|토르비|톨비|시에라|독트린|키리코|메르시|아나|리퍼|브리기테')
EVALUATION = re.compile(r'평가|선호|뽑|픽|티어|잘|못|기본기|포지션|크랙|오더|브리핑|콜|에임|영웅폭|챔프풀|생존|힐|궁|다이브|사이드|자원')

def audit(source, output):
    raw = [json.loads(line) for line in source.read_text(encoding='utf-8').splitlines() if line.strip()]
    posts = {}
    for p in raw:
        # Repeated URL is one source; prefer the most recently checked snapshot.
        url = p['url']
        if url not in posts or p.get('comments_checked_at','') > posts[url].get('comments_checked_at',''):
            posts[url] = p
    hashes, candidates, comments = set(), [], set()
    coverage = {name:collections.Counter() for name in ALIASES}
    exact_duplicates = 0
    for p in posts.values():
        content = p.get('title','')+'\n'+p.get('text','')
        digest = hashlib.sha256(re.sub(r'\s+',' ',content).strip().encode()).hexdigest()
        if digest in hashes:
            exact_duplicates += 1
        hashes.add(digest)
        for c in p.get('comments',[]):
            comments.add((p['url'], c.get('id') or (c.get('author',''),c.get('text',''))))
        block = content+'\n'+'\n'.join(c.get('text','') for c in p.get('comments',[]))
        names = [n for n,aliases in ALIASES.items() if any(a in block for a in aliases)]
        if not names or not CONTEXT.search(block) or not EVALUATION.search(block):
            continue
        for name in names:
            coverage[name][p.get('posted_at','')[:10]] += 1
        candidates.append({'url':p['url'],'at':p.get('posted_at'),'title':p.get('title'),
                           'players':names,'text':p.get('text',''),'comments':p.get('comments',[])})
    dates = [p.get('posted_at','') for p in posts.values()]
    summary = {'raw_posts':len(raw),'unique_urls':len(posts),'unique_comments':len(comments),
               'exact_content_duplicates':exact_duplicates,'start':min(dates),'end':max(dates),
               'by_day':dict(sorted(collections.Counter(d[:10] for d in dates).items())),
               'contextual_candidates':len(candidates),
               'player_context_coverage':{n:dict(sorted(c.items())) for n,c in coverage.items()},
               'limitations':['Candidates are for manual review, not verified performance.',
                              'Aliases can match unrelated subjects; no automatic scoring.',
                              'Comments retain post time when absolute comment time is unavailable.',
                              'Repeated reports of the same event require manual grouping.']}
    output.mkdir(parents=True,exist_ok=True)
    (output/'corpus-audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    (output/'review-candidates.jsonl').write_text('\n'.join(json.dumps(p,ensure_ascii=False) for p in sorted(candidates,key=lambda p:p['at'],reverse=True)),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False,indent=2))

if __name__ == '__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('source',type=Path)
    parser.add_argument('--output',type=Path,default=Path('audit'))
    args=parser.parse_args()
    audit(args.source,args.output)
