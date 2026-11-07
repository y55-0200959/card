export function loadImage(src){return new Promise((resolve,reject)=>{let im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(new Error('無法讀取圖片'));im.src=src})}
export function fileData(file){return new Promise((resolve,reject)=>{let r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file)})}
export async function normalizeImage(src,maxEdge=1800,quality=.9){let im=await loadImage(src),scale=Math.min(1,maxEdge/Math.max(im.width,im.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(im.width*scale));c.height=Math.max(1,Math.round(im.height*scale));c.getContext('2d').drawImage(im,0,0,c.width,c.height);return c.toDataURL('image/jpeg',quality)}
export const defaultQuad=()=>[[.06,.06],[.94,.06],[.94,.94],[.06,.94]];
// Sobel gradients + morphological joining + connected component analysis.
// Pure JS so it still works without a CDN in an offline WKWebView.
export function detectCardEdges(image){
 let w=Math.round(360*image.width/Math.max(image.width,image.height)),h=Math.round(360*image.height/Math.max(image.width,image.height));w=Math.max(60,w);h=Math.max(60,h);
 let can=document.createElement('canvas');can.width=w;can.height=h;let ctx=can.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,w,h);
 const rgba=ctx.getImageData(0,0,w,h).data,g=new Float32Array(w*h),blur=new Float32Array(w*h),mag=new Float32Array(w*h);
 for(let i=0;i<g.length;i++)g[i]=.299*rgba[4*i]+.587*rgba[4*i+1]+.114*rgba[4*i+2];
 for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let j=y*w+x;blur[j]=(g[j-w-1]+g[j-w]+g[j-w+1]+g[j-1]+g[j]*2+g[j+1]+g[j+w-1]+g[j+w]+g[j+w+1])/10}
 const values=[];for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){let i=y*w+x;let gx=-blur[i-w-1]+blur[i-w+1]-2*blur[i-1]+2*blur[i+1]-blur[i+w-1]+blur[i+w+1];let gy=-blur[i-w-1]-2*blur[i-w]-blur[i-w+1]+blur[i+w-1]+2*blur[i+w]+blur[i+w+1];let strength=Math.hypot(gx,gy);mag[i]=strength;if((x+y)%4===0)values.push(strength)}
 values.sort((a,b)=>a-b);const threshold=Math.max(75,values[Math.floor(values.length*.86)]||0);let binary=new Uint8Array(w*h);
 for(let y=3;y<h-3;y++)for(let x=3;x<w-3;x++)if(mag[y*w+x]>threshold){let i=y*w+x;binary[i]=binary[i-1]=binary[i+1]=binary[i-w]=binary[i+w]=1}
 const seen=new Uint8Array(w*h);let best=null,bestScore=0,queue=new Int32Array(w*h);
 for(let y=4;y<h-4;y+=2)for(let x=4;x<w-4;x+=2){let start=y*w+x;if(!binary[start]||seen[start])continue;let head=0,tail=1;queue[0]=start;seen[start]=1;let minX=w,maxX=0,minY=h,maxY=0,candidates=[];
 while(head<tail){let v=queue[head++],px=v%w,py=(v/w)|0;minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);if(head%2===0)candidates.push([px,py]);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dy&&!dx)continue;let nx=px+dx,ny=py+dy;if(nx<2||ny<2||nx>=w-2||ny>=h-2)continue;let ni=ny*w+nx;if(binary[ni]&&!seen[ni]){seen[ni]=1;queue[tail++]=ni}}}
 let bw=(maxX-minX)/w,bh=(maxY-minY)/h,area=bw*bh;let centerDist=Math.hypot((minX+maxX)/2/w-.5,(minY+maxY)/2/h-.5);let touchesBorder=minX<7||minY<7||maxX>w-8||maxY>h-8;
 if(tail<Math.max(70,w*h*.0015)||bw<.28||bh<.28||area<.12||area>.95)continue;
 let score=area*(1-Math.min(.7,centerDist))*(touchesBorder?.38:1)*Math.min(1,tail/(w+h));if(score>bestScore){bestScore=score;best=candidates}}
 if(!best||best.length<20)return defaultQuad();
 let corners=[null,null,null,null],extremes=[Infinity,-Infinity,-Infinity,-Infinity];
 for(let [x,y] of best){let v=[x+y,x-y,x+y,y-x];if(v[0]<extremes[0]){extremes[0]=v[0];corners[0]=[x/w,y/h]}if(v[1]>extremes[1]){extremes[1]=v[1];corners[1]=[x/w,y/h]}if(v[2]>extremes[2]){extremes[2]=v[2];corners[2]=[x/w,y/h]}if(v[3]>extremes[3]){extremes[3]=v[3];corners[3]=[x/w,y/h]}}
 if(corners.some(x=>!x))return defaultQuad();const polygonArea=Math.abs(corners.reduce((sum,p,i)=>sum+p[0]*corners[(i+1)%4][1]-corners[(i+1)%4][0]*p[1],0)/2);if(polygonArea<.12)return defaultQuad();return corners.map(([x,y])=>[Math.min(.99,Math.max(.01,x)),Math.min(.99,Math.max(.01,y))])
}
// Homography maps output rectangles into quadrilateral image coordinates.
export function rectifyCard(im,quad){const W=600,H=900,inCanvas=document.createElement('canvas');inCanvas.width=im.width;inCanvas.height=im.height;let ic=inCanvas.getContext('2d',{willReadFrequently:true});ic.drawImage(im,0,0);let src=ic.getImageData(0,0,im.width,im.height).data,out=document.createElement('canvas');out.width=W;out.height=H;let oc=out.getContext('2d'),dest=oc.createImageData(W,H),dst=dest.data;
 let [a,b,c,d]=quad.map(([x,y])=>[x*im.width,y*im.height]);let dx1=b[0]-c[0],dx2=d[0]-c[0],dx3=a[0]-b[0]+c[0]-d[0],dy1=b[1]-c[1],dy2=d[1]-c[1],dy3=a[1]-b[1]+c[1]-d[1],den=dx1*dy2-dx2*dy1,g=0,h=0;
 if(Math.abs(den)>1e-8){g=(dx3*dy2-dx2*dy3)/den;h=(dx1*dy3-dx3*dy1)/den}
 let A=b[0]-a[0]+g*b[0],B=d[0]-a[0]+h*d[0],C=a[0],D=b[1]-a[1]+g*b[1],E=d[1]-a[1]+h*d[1],F=a[1];let iw=im.width,ih=im.height;
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){let u=x/(W-1),v=y/(H-1),z=g*u+h*v+1,sx=Math.max(0,Math.min(iw-1.0001,(A*u+B*v+C)/z)),sy=Math.max(0,Math.min(ih-1.0001,(D*u+E*v+F)/z));let ix=sx|0,iy=sy|0,fx=sx-ix,fy=sy-iy,j=(iy*iw+ix)*4,jx=(iy*iw+Math.min(iw-1,ix+1))*4,jy=(Math.min(ih-1,iy+1)*iw+ix)*4,jxy=(Math.min(ih-1,iy+1)*iw+Math.min(iw-1,ix+1))*4,k=(y*W+x)*4;for(let ch=0;ch<3;ch++)dst[k+ch]=src[j+ch]*(1-fx)*(1-fy)+src[jx+ch]*fx*(1-fy)+src[jy+ch]*(1-fx)*fy+src[jxy+ch]*fx*fy;dst[k+3]=255}
 oc.putImageData(dest,0,0);return out.toDataURL('image/jpeg',.9)
}
export async function autoCrop(src){const im=await loadImage(src);return {image:rectifyCard(im,detectCardEdges(im)),raw:src}}
