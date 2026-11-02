import json, math
tris_all=json.load(open("tools/_bandtris.json"))
world={k:[tuple(tuple(v) for v in tri) for tri in v] for k,v in tris_all.items()}
CX=-32.4; DECK=7.32
PERF=[("p_drums","drums",-10.95,107.62,90,10),
      ("p_guitar","guitar",-15.05,101.12,92,12),
      ("p_keys","keys",11.55,108.90,90,9),
      ("p_bass","bass",14.85,101.12,88,12)]
BODY=[("head",1.58),("chest",1.20),("waist",0.95),("knee",0.50),("shin",0.25)]
CAMS={"aud-north":[-32.4,21,-42],"stands":[-32,44,-40],"stagefront":[-32,9,22],
      "aud-south":[-32.4,36,158],"aerial":[-262,175,320],"facade":[-32,42,402]}
def body_pt(x,z,yaw,lean,y):
    yr=math.radians(yaw); lr=math.radians(-lean)
    lx=-y*math.sin(lr); ly=y*math.cos(lr); lz=0.0
    return (CX+x+lx*math.cos(yr)+lz*math.sin(yr), DECK+ly, z-lx*math.sin(yr)+lz*math.cos(yr))
def ray_tri(o,d,tri):
    e1=tuple(tri[1][i]-tri[0][i] for i in range(3)); e2=tuple(tri[2][i]-tri[0][i] for i in range(3))
    h=(d[1]*e2[2]-d[2]*e2[1], d[2]*e2[0]-d[0]*e2[2], d[0]*e2[1]-d[1]*e2[0])
    a=sum(e1[i]*h[i] for i in range(3))
    if abs(a)<1e-9: return None
    f=1.0/a; s=tuple(o[i]-tri[0][i] for i in range(3))
    u=f*sum(s[i]*h[i] for i in range(3))
    if u<0 or u>1: return None
    q=(s[1]*e1[2]-s[2]*e1[1], s[2]*e1[0]-s[0]*e1[2], s[0]*e1[1]-s[1]*e1[0])
    v=f*sum(d[i]*q[i] for i in range(3))
    if v<0 or u+v>1: return None
    t=f*sum(e2[i]*q[i] for i in range(3))
    return t if t>1e-4 else None
def hit(o,pt,own):
    d=tuple(pt[i]-o[i] for i in range(3)); L=math.sqrt(sum(c*c for c in d)); d=tuple(c/L for c in d)
    for tri in world[own]:
        t=ray_tri(o,d,tri)
        if t is not None and t<L-0.05: return True
    return False
print("=== 自家乐器遮挡人体比例（演奏姿态判据：头必须露出，下半身被挡）===")
for cname,o in CAMS.items():
    print(f"\n--- {cname} ---")
    for pid,own,x,z,yaw,lean in PERF:
        marks=[]
        for bn,by in BODY:
            pt=body_pt(x,z,yaw,lean,by)
            marks.append(f"{bn}={'X' if hit(o,pt,own) else 'o'}")
        nocc=sum(1 for m in marks if m.endswith('X'))
        print(f"  {pid:9s} {' '.join(marks)}   被挡 {nocc}/{len(BODY)} = {nocc/len(BODY)*100:.0f}%")


