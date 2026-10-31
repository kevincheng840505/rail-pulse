import json,sys
d=json.load(open(sys.argv[1]))
sx,sy=d['transform']['scale'];tx,ty=d['transform']['translate']
arcs=[]
for a in d['arcs']:
    x=y=0;pts=[]
    for dx,dy in a:
        x+=dx;y+=dy;pts.append((x*sx+tx,y*sy+ty))
    arcs.append(pts)
def arc(i):
    return arcs[i] if i>=0 else arcs[~i][::-1]
def ring(idx):
    pts=[]
    for i in idx:
        p=arc(i)
        pts.extend(p if not pts else p[1:])
    return pts
Q=0.0025
out=[]
for g in d['objects']['counties']['geometries']:
    polys=[g['arcs']] if g['type']=='Polygon' else g['arcs']
    rings=[]
    for poly in polys:
        for r in poly[:1]:  # outer rings only
            pts=ring(r);q=[]
            for lon,lat in pts:
                p=(round(lon/Q),round(lat/Q))
                if not q or q[-1]!=p: q.append(p)
            if len(q)<4: continue
            # skip tiny islets
            xs=[p[0] for p in q];ys=[p[1] for p in q]
            if (max(xs)-min(xs))*(max(ys)-min(ys))<6: continue
            # delta encode
            flat=[q[0][0],q[0][1]]
            for a,b in zip(q,q[1:]): flat+= [b[0]-a[0],b[1]-a[1]]
            rings.append(flat)
    out.append({'n':g['properties']['COUNTYNAME'],'r':rings})
print(json.dumps({'q':Q,'c':out},ensure_ascii=False,separators=(',',':')))
