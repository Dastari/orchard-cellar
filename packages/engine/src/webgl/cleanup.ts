/** Teardown must attempt every independently owned resource even if an API or
 * injected host disposer throws. The caller remains responsible for reporting
 * failures; this never claims that a throwing GPU deletion succeeded. */
export function collectWebGLCleanup(actions:readonly (()=>void)[]):unknown[] {
  const errors:unknown[]=[];
  for(const action of actions)try{action();}catch(error){errors.push(error);}
  return errors;
}
export function cleanupWebGL(actions:readonly (()=>void)[],message:string):void {
  const errors=collectWebGLCleanup(actions);
  if(errors.length)throw new AggregateError(errors,message);
}
