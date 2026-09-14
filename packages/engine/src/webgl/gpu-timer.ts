import { cleanupWebGL } from './cleanup.js';
interface TimerExtension { readonly TIME_ELAPSED_EXT:number; readonly GPU_DISJOINT_EXT:number }
interface TimerQuery { readonly query:WebGLQuery; pending:boolean }
/** Optional diagnostics only. Results are polled after availability; the render
 * loop never waits for a GPU result and retains at most eight reusable queries. */
export class WebGLGpuTimer {
  private extension:TimerExtension | null=null;
  private readonly queries:TimerQuery[]=[];
  private active:TimerQuery | null=null;
  private latest:number | null=null;
  private completed=0;
  private discarded=0;
  private disposed=false;
  constructor(private readonly gl:WebGL2RenderingContext) { this.restore(); }
  get diagnostics() {return {gpuTimingAvailable:this.extension!==null,gpuTimeMs:this.latest,gpuCompletedSamples:this.completed,
    gpuDisjointSamples:this.discarded,gpuPendingQueries:this.queries.filter(query=>query.pending).length,gpuQueries:this.queries.length};}
  begin():void {
    const ext=this.extension,gl=this.gl;if(!ext||this.disposed||gl.isContextLost())return;
    // A missed composite must not leave an active target across frames.
    if(this.active)this.end();
    if(gl.getParameter(ext.GPU_DISJOINT_EXT)){
      this.discarded+=this.queries.filter(query=>query.pending).length;this.releaseQueries();this.latest=null;return;
    }
    for(const entry of this.queries)if(entry.pending&&gl.getQueryParameter(entry.query,gl.QUERY_RESULT_AVAILABLE)){
      const value=gl.getQueryParameter(entry.query,gl.QUERY_RESULT);
      if(Number.isFinite(value)&&value>=0){this.latest=value/1e6;this.completed++;}entry.pending=false;
    }
    let entry=this.queries.find(query=>!query.pending);
    if(!entry&&this.queries.length<8){const query=gl.createQuery();if(query){entry={query,pending:false};this.queries.push(entry);}}
    if(entry){gl.beginQuery(ext.TIME_ELAPSED_EXT,entry.query);this.active=entry;}
  }
  end():void {
    if(!this.active||!this.extension)return;
    const active=this.active;this.active=null;
    if(!this.gl.isContextLost()){this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);active.pending=true;}
  }
  reset():void {this.latest=null;cleanupWebGL([()=>this.end(),()=>this.releaseQueries()],'webgl_timer_reset_failed');}
  restore():void {
    this.reset();this.disposed=false;
    this.extension=this.gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerExtension | null;
  }
  dispose():void {this.disposed=true;try{this.reset();}finally{this.extension=null;}}
  private releaseQueries():void {const queries=this.queries.slice();this.queries.length=0;this.active=null;cleanupWebGL(queries.map(({query})=>()=>this.gl.deleteQuery(query)),'webgl_queries_dispose_failed');}
}
