import json, math
tris_all=json.load(open("tools/_bandtris.json"))
world={k:[tuple(tuple(v) for v in tri) for tri in v] for k,v in tris_all.items()}
CX=-32.4; DECK=7.32
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
def inside(p,tris):
    n=0
    for tri in tris:
        if ray_tri(p,(1.0,0.0,0.0),tri) is not None: n+=1
    return n%2==1
def pen(x,z,yaw,lean,own):
    h=0
    for lx in [-0.32,-0.16,0.0,0.16,0.32]:
        for ly in [0.25,0.55,0.85,1.15,1.45,1.65]:
            yr=math.radians(yaw); lr=math.radians(-lean)
            rx=lx*math.cos(lr)-ly*math.sin(lr); ry=lx*math.sin(lr)+ly*math.cos(lr)
            p=(CX+x+rx*math.cos(yr), DECK+ry, z-rx*math.sin(yr))
            if inside(p,world[own]): h+=1
    return h
PERF=[("p_drums","drums",-10.95,107.62,90,10),
      ("p_guitar","guitar",-15.05,101.12,92,9),
      ("p_keys","keys",11.55,108.90,90,9),
      ("p_bass","bass",14.85,101.12,88,9)]
print("=== 最终摆位：前倾摆动全程穿模检查（base .. base+2.87deg）===")
ok=True
for pid,own,x,z,yaw,lean in PERF:
    mx=max(pen(x,z,yaw,lean+i*0.3,own) for i in range(0,11))
    if mx: ok=False
    print(f"  {pid:9s} base={lean} deg -> {lean+2.87:.1f} deg   max penetration={mx}/30")
print("\nALL CLEAR" if ok else "\nSTILL PENETRATING")
