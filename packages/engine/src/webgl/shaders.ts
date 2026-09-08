import { collectWebGLCleanup } from './cleanup.js';
import { requireWebGL, WebGLWorldPassError } from './failure.js';
export const WORLD_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location=0) in vec2 position;
layout(location=1) in vec2 uv;
layout(location=2) in vec4 color;
layout(location=3) in vec2 lightUv;
layout(location=4) in float mode;
uniform vec2 resolution;
out vec2 texCoord;
out vec4 tint;
out vec2 lightCoord;
flat out int operation;
void main() {
 gl_Position=vec4(position.x/resolution.x*2.0-1.0,1.0-position.y/resolution.y*2.0,0,1);
 texCoord=uv; tint=color; lightCoord=lightUv; operation=int(mode);
}`;
export const WORLD_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D page;
uniform sampler2D light;
uniform sampler2D sunCoverage;
uniform sampler2D moonCoverage;
uniform sampler2D contactCoverage;
uniform sampler2D clipMask;
uniform int clipEnabled;
uniform vec4 clipRectangle;
uniform float clipOutside;
uniform vec2 resolution;
uniform int rawCoverage;
uniform float fieldStep;
uniform vec3 diffuseLight;
uniform vec3 sunLight;
uniform vec3 moonLight;
in vec2 texCoord;
in vec4 tint;
in vec2 lightCoord;
flat in int operation;
out vec4 outputColor;
vec3 byteRound(vec3 value) { return floor(value*255.0+0.5)/255.0; }
vec3 resolvedCorner(ivec2 position) {
 ivec2 p=clamp(position,ivec2(0),textureSize(light,0)-ivec2(1));
 float contact=1.0-texelFetch(contactCoverage,p,0).r*0.18;
 vec3 diffuse=byteRound(diffuseLight*contact);
 vec3 sun=byteRound(sunLight*(1.0-texelFetch(sunCoverage,p,0).r)*contact);
 vec3 moon=byteRound(moonLight*(1.0-texelFetch(moonCoverage,p,0).r)*contact);
 return max(max(diffuse,sun),max(moon,texelFetch(light,p,0).rgb));
}
vec4 groundLight() {
 vec2 pageSize=vec2(textureSize(page,0));
 vec2 coord=lightCoord;
 if(operation!=5) coord+=(floor(texCoord*pageSize)+0.5-texCoord*pageSize)/(vec2(textureSize(light,0))*fieldStep);
 if(any(lessThan(coord,vec2(0))) || any(greaterThanEqual(coord,vec2(1)))) return vec4(0);
 if(rawCoverage==0) return texture(light,coord);
 vec2 p=coord*vec2(textureSize(light,0))-0.5;
 ivec2 corner=ivec2(floor(p)); vec2 f=fract(p);
 return vec4(mix(mix(resolvedCorner(corner),resolvedCorner(corner+ivec2(1,0)),f.x),
            mix(resolvedCorner(corner+ivec2(0,1)),resolvedCorner(corner+ivec2(1,1)),f.x),f.y),1);
}
float clipCoverage() {
 if(clipEnabled==0) return 1.0;
 vec2 point=vec2(gl_FragCoord.x,resolution.y-gl_FragCoord.y)-clipRectangle.xy;
 if(any(lessThan(point,vec2(0))) || any(greaterThanEqual(point,clipRectangle.zw))) return clipOutside;
 return texelFetch(clipMask,ivec2(floor(point)),0).a;
}
void main() {
 vec4 original=texture(page,texCoord);
 vec4 value=original;
 if(operation==5) { value=groundLight(); }
 else if(operation==1 || operation==2 || operation==4) {
  vec4 ground=operation==2 ? groundLight() : vec4(tint.rgb,1);
  vec3 rgb=ground.rgb;
  value.rgb=floor(byteRound(rgb*(original.rgb+vec3(1.0-original.a))+original.rgb*(1.0-ground.a))*255.0*original.a)/255.0;
  if(ground.a==0.0) value.a=byteRound(vec3(original.a*original.a)).r;
  if(operation==4) { value.rgb=byteRound(original.rgb+value.rgb*(1.0-original.a)); value.a=original.a+original.a*(1.0-original.a); }
 } else if(operation==3) { value=vec4(tint.rgb,1); }
 outputColor=floor(value*255.0*floor(tint.a*256.0)/256.0+0.0001)/255.0*clipCoverage();
}`;
export interface WorldProgram { readonly clipEnabled:WebGLUniformLocation; readonly clipRectangle:WebGLUniformLocation; readonly clipOutside:WebGLUniformLocation; readonly program: WebGLProgram; readonly resolution: WebGLUniformLocation; readonly rawCoverage:WebGLUniformLocation; readonly fieldStep:WebGLUniformLocation; readonly diffuseLight:WebGLUniformLocation; readonly sunLight:WebGLUniformLocation; readonly moonLight:WebGLUniformLocation }
export function createWorldProgram(gl: WebGL2RenderingContext): WorldProgram {
  const program = requireWebGL(gl.createProgram(), 'webgl_program_unavailable');
  const shaders: WebGLShader[] = [];
  let result:WorldProgram | undefined,failure:unknown,failed=false;
  try {
    for (const [type, source] of [[gl.VERTEX_SHADER, WORLD_VERTEX_SHADER], [gl.FRAGMENT_SHADER, WORLD_FRAGMENT_SHADER]] as const) {
      const shader = requireWebGL(gl.createShader(type), 'webgl_shader_unavailable'); shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new WebGLWorldPassError(`webgl_shader_compile:${gl.getShaderInfoLog(shader) ?? ''}`);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new WebGLWorldPassError(`webgl_shader_link:${gl.getProgramInfoLog(program) ?? ''}`);
    gl.useProgram(program);
    gl.uniform1i(requireWebGL(gl.getUniformLocation(program, 'page'), 'webgl_page_uniform'), 0);
    gl.uniform1i(requireWebGL(gl.getUniformLocation(program, 'light'), 'webgl_light_uniform'), 1);
    gl.uniform1i(requireWebGL(gl.getUniformLocation(program, 'clipMask'), 'webgl_clip_uniform'), 5);
    for (const [name,unit] of [['sunCoverage',2],['moonCoverage',3],['contactCoverage',4]] as const) gl.uniform1i(requireWebGL(gl.getUniformLocation(program,name),'webgl_coverage_uniform'),unit);
    result={ program, clipEnabled:requireWebGL(gl.getUniformLocation(program,'clipEnabled'),'webgl_clip_enabled_uniform'),
      clipRectangle:requireWebGL(gl.getUniformLocation(program,'clipRectangle'),'webgl_clip_rectangle_uniform'),clipOutside:requireWebGL(gl.getUniformLocation(program,'clipOutside'),'webgl_clip_outside_uniform'), fieldStep:requireWebGL(gl.getUniformLocation(program,'fieldStep'),'webgl_field_step_uniform'),rawCoverage:requireWebGL(gl.getUniformLocation(program,'rawCoverage'),'webgl_raw_uniform'),
      diffuseLight:requireWebGL(gl.getUniformLocation(program,'diffuseLight'),'webgl_diffuse_uniform'),sunLight:requireWebGL(gl.getUniformLocation(program,'sunLight'),'webgl_sun_uniform'),moonLight:requireWebGL(gl.getUniformLocation(program,'moonLight'),'webgl_moon_uniform'),resolution: requireWebGL(gl.getUniformLocation(program, 'resolution'), 'webgl_resolution_uniform') };
  }catch(error){failed=true;failure=error;}
  const errors=collectWebGLCleanup(shaders.flatMap(shader=>[()=>gl.detachShader(program,shader),()=>gl.deleteShader(shader)]));
  if(failed||errors.length){
    errors.push(...collectWebGLCleanup([()=>gl.deleteProgram(program)]));
    if(failed&&!errors.length)throw failure;
    throw new AggregateError(failed?[failure,...errors]:errors,'webgl_shader_cleanup_failed',{cause:failure});
  }
  return result!;
}
