/** A-14a: explicit source-axis ratios and screen origin. Unsupported domains
 * use the existing texture path; production guards remain in the caller. */
export function mapping(rect: readonly number[], source: readonly number[] | undefined,
  m: readonly number[], smooth: boolean): readonly number[] {
  const empty = [0,0,0,0,0,0,0,1,0,1,0,0];
  if (!source || smooth || source.some(v => !Number.isInteger(v))) return empty;
  const ux=m[0]!*rect[2]!,uy=m[1]!*rect[2]!,vx=m[2]!*rect[3]!,vy=m[3]!*rect[3]!;
  const eps=1e-9;
  const axisX=Math.abs(uy)<eps ? Math.sign(ux) : Math.abs(ux)<eps ? Math.sign(uy)*2 : 0;
  const axisY=Math.abs(vy)<eps ? Math.sign(vx) : Math.abs(vx)<eps ? Math.sign(vy)*2 : 0;
  if (!axisX || !axisY || Math.abs(axisX)===Math.abs(axisY)) return empty;
  const ratio=(s:number,d:number):readonly number[] | undefined => {
    const r=s/d,n=Math.round(r),q=Math.round(1/r);
    if(n>=1 && n<=32767 && Math.abs(r-n)<eps)return [n,1];
    if(q>=1 && q<=32767 && Math.abs(1/r-q)<eps)return [1,q];
    return undefined;
  };
  const rx=ratio(source[2]!,Math.hypot(ux,uy)),ry=ratio(source[3]!,Math.hypot(vx,vy));
  if(!rx || !ry)return empty;
  return [...source,m[0]!*rect[0]!+m[2]!*rect[1]!+m[4]!,m[1]!*rect[0]!+m[3]!*rect[1]!+m[5]!,...rx,...ry,axisX,axisY];
}
