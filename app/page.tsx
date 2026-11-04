"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {BoothSettings,BoothOptions,defaults} from "./PhotoboothSettings";
import {BOOTH_BACKGROUNDS,getBoothBackground,paintBoothBackground} from "./boothBackgrounds";
import {clearPhotos,deletePhoto,getPhotos,savePhoto,StoredPhoto,purgeExpiredPhotos,PHOTO_TTL_MS} from "../lib/photo-store";
import {blobToDataUrl,getTemplatePreset,listTemplatePresets,saveTemplatePreset as persistTemplatePreset} from "../lib/template-store";

type Tab="home"|"camera"|"settings";
type Shot={id:string;src:string;createdAt:number;name?:string};
type LayoutId="grid"|"template"|"vertical"|"horizontal"|"threeOne"|"film"|"polaroid"|"oneFour"|"twoThree";
type Sticker={id:string;glyph:string;x:number;y:number;size:number};
type TemplateSlot={x:number;y:number;w:number;h:number;area:number;shape:"transparent"|"dark";zoom?:number;ox?:number;oy?:number};

const FILTERS:Record<string,string>={"Gốc":"none","Đen trắng":"grayscale(1)","Digicam":"contrast(1.28) saturate(1.35) brightness(1.03)","Phim":"sepia(.45) contrast(1.08) saturate(1.05)","Mộng mơ":"brightness(1.12) saturate(.82) contrast(.96)","Pastel":"brightness(1.08) saturate(.78) contrast(.94)","Warm":"sepia(.16) saturate(1.18) contrast(1.02)","Flash":"brightness(1.18) contrast(1.12) saturate(1.12)"};
const LAYOUTS:{id:LayoutId;name:string}[]=[{id:"template",name:"Template nghệ thuật"},{id:"oneFour",name:"Photo Strip 1×4"},{id:"grid",name:"Lưới 2×2"},{id:"twoThree",name:"Lưới 2×3"},{id:"vertical",name:"Dải dọc"},{id:"horizontal",name:"Dải ngang"},{id:"threeOne",name:"3 + 1"},{id:"film",name:"Film strip"},{id:"polaroid",name:"Polaroid"}];
const STICKERS=["♥","🎀","★","✦","✿","🐱","🌈","🍒"];
const FONT_MAP:Record<string,string>={"Hiện đại":"Inter,Arial,sans-serif","Cổ điển":"Georgia,serif","Viết tay":"cursive","Máy chữ":"monospace"};
function uid(){return crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`}
function wait(ms:number){return new Promise(r=>setTimeout(r,ms))}
function loadImage(src:string){return new Promise<HTMLImageElement>((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=src})}
function downloadBlob(blob:Blob,name:string){const u=URL.createObjectURL(blob),a=document.createElement("a");a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500)}
async function saveImageToDevice(blob:Blob,name:string){
  const file=new File([blob],name,{type:blob.type||"image/png"});
  try{
    if(typeof navigator!=="undefined" && "share" in navigator && "canShare" in navigator){
      const nav=navigator as Navigator & {share?:(data:ShareData)=>Promise<void>;canShare?:(data:ShareData)=>boolean};
      if(nav.canShare?.({files:[file]})){
        await nav.share?.({files:[file],title:"LH PTB",text:"Ảnh Photo Booth chất lượng cao"});
        return "shared" as const;
      }
    }
  }catch(err){
    if(err instanceof DOMException && err.name==="AbortError") return "cancelled" as const;
  }
  downloadBlob(blob,name);
  return "downloaded" as const;
}
function fitImage(ctx:CanvasRenderingContext2D,img:HTMLImageElement,x:number,y:number,w:number,h:number){const s=Math.max(w/img.width,h/img.height);const dw=img.width*s,dh=img.height*s;ctx.drawImage(img,x+(w-dw)/2,y+(h-dh)/2,dw,dh)}
function rounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number){r=Math.min(r,w/2,h/2);ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function drawSticker(ctx:CanvasRenderingContext2D,s:Sticker,w:number,h:number){
  const x=w*s.x, y=h*s.y, r=Math.max(18,s.size*w/900);
  ctx.save();
  ctx.translate(x,y);
  ctx.shadowColor="rgba(0,0,0,.22)";ctx.shadowBlur=Math.max(4,r*.18);ctx.shadowOffsetY=Math.max(2,r*.08);
  ctx.lineCap="round";ctx.lineJoin="round";
  const fill=(c:string)=>{ctx.fillStyle=c};
  if(s.glyph==="♥"){
    ctx.beginPath();ctx.moveTo(0,r*.9);ctx.bezierCurveTo(-r*1.25,r*.05,-r*.95,-r*.9,-r*.38,-r*.9);ctx.bezierCurveTo(-r*.08,-r*.9,0,-r*.65,0,-r*.42);ctx.bezierCurveTo(0,-r*.65,r*.08,-r*.9,r*.38,-r*.9);ctx.bezierCurveTo(r*.95,-r*.9,r*1.25,r*.05,0,r*.9);ctx.closePath();fill("#b52a3a");ctx.fill();
  }else if(s.glyph==="🎀"){
    fill("#d86b8a");ctx.beginPath();ctx.ellipse(-r*.55,0,r*.58,r*.42,-.35,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(r*.55,0,r*.58,r*.42,.35,0,Math.PI*2);ctx.fill();fill("#f3a4b8");ctx.beginPath();ctx.arc(0,0,r*.25,0,Math.PI*2);ctx.fill();
  }else if(s.glyph==="★"||s.glyph==="✦"){
    const points=s.glyph==="★"?5:4;const inner=s.glyph==="★"?r*.42:r*.16;ctx.beginPath();for(let i=0;i<points*2;i++){const a=-Math.PI/2+i*Math.PI/points, rr=i%2===0?r:inner;const px=Math.cos(a)*rr,py=Math.sin(a)*rr;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}ctx.closePath();fill("#f0c84b");ctx.fill();
  }else if(s.glyph==="✿"){
    fill("#d86b8a");for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.beginPath();ctx.ellipse(Math.cos(a)*r*.45,Math.sin(a)*r*.45,r*.38,r*.22,a,0,Math.PI*2);ctx.fill()}fill("#f4c84a");ctx.beginPath();ctx.arc(0,0,r*.2,0,Math.PI*2);ctx.fill();
  }else if(s.glyph==="🐱"){
    fill("#d9a26c");ctx.beginPath();ctx.arc(0,r*.12,r*.62,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.moveTo(-r*.48,-r*.28);ctx.lineTo(-r*.72,-r*.78);ctx.lineTo(-r*.12,-r*.58);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(r*.48,-r*.28);ctx.lineTo(r*.72,-r*.78);ctx.lineTo(r*.12,-r*.58);ctx.closePath();ctx.fill();fill("#222");ctx.beginPath();ctx.arc(-r*.22,0,r*.07,0,Math.PI*2);ctx.arc(r*.22,0,r*.07,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#222";ctx.lineWidth=Math.max(2,r*.04);ctx.beginPath();ctx.arc(0,r*.18,r*.18,.15,Math.PI-.15);ctx.stroke();
  }else if(s.glyph==="🌈"){
    const colors=["#e65b5b","#f2a43b","#f0d04b","#65b66d","#5d8fd6","#9b6bc0"];colors.forEach((c,i)=>{ctx.strokeStyle=c;ctx.lineWidth=Math.max(4,r*.16);ctx.beginPath();ctx.arc(0,r*.28,r*(.9-i*.12),Math.PI,Math.PI*2);ctx.stroke()});
  }else if(s.glyph==="🍒"){
    ctx.strokeStyle="#4f7d45";ctx.lineWidth=Math.max(3,r*.08);ctx.beginPath();ctx.moveTo(-r*.1,-r*.2);ctx.quadraticCurveTo(-r*.05,-r*.72,-r*.45,-r*.9);ctx.moveTo(r*.1,-r*.2);ctx.quadraticCurveTo(r*.05,-r*.72,r*.45,-r*.9);ctx.stroke();fill("#b52a3a");ctx.beginPath();ctx.arc(-r*.28,r*.15,r*.34,0,Math.PI*2);ctx.arc(r*.28,r*.15,r*.34,0,Math.PI*2);ctx.fill();fill("#6b9a52");ctx.beginPath();ctx.ellipse(-r*.4,-r*.78,r*.28,r*.13,-.35,0,Math.PI*2);ctx.ellipse(r*.4,-r*.78,r*.28,r*.13,.35,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
}
async function paintBackgroundLayer(ctx:CanvasRenderingContext2D,W:number,H:number,bgId:string,customBg:string|null,blurAmount:number){
  const layer=document.createElement("canvas"); layer.width=W; layer.height=H;
  const lctx=layer.getContext("2d"); if(!lctx) throw Error("Canvas unavailable");
  if(customBg){ const img=await loadImage(customBg); fitImage(lctx,img,0,0,W,H); }
  else paintBoothBackground(lctx,W,H,getBoothBackground(bgId));
  ctx.save();
  if(blurAmount>0) ctx.filter=`blur(${Math.min(18,blurAmount*4)}px)`;
  ctx.drawImage(layer,0,0);
  ctx.restore();
}
function patternPaint(ctx:CanvasRenderingContext2D,pattern:string,w:number,h:number){if(!pattern)return;ctx.save();ctx.globalAlpha=.12;ctx.strokeStyle="#fff";ctx.lineWidth=3;if(pattern==="Chấm bi"){for(let y=20;y<h;y+=42)for(let x=20;x<w;x+=42){ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.stroke()}}else if(pattern==="Caro"){for(let x=0;x<w;x+=50){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}for(let y=0;y<h;y+=50){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}}else if(pattern==="Kẻ sọc"){for(let x=-h;x<w;x+=48){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+h,h);ctx.stroke()}}else{ctx.font="26px sans-serif";for(let y=30;y<h;y+=60)for(let x=20;x<w;x+=80)ctx.fillText(pattern==="Kim tuyến"?"✦":"•",x,y)}ctx.restore()}


function detectTemplateSlots(src:string):Promise<{width:number;height:number;slots:TemplateSlot[]}> {
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      // Analyze at a moderate resolution, then convert every slot back to the
      // ORIGINAL template coordinate system. This avoids cumulative rounding
      // errors when the template is displayed or exported at another size.
      const max=900;
      const scale=Math.min(1,max/Math.max(img.width,img.height));
      const w=Math.max(1,Math.round(img.width*scale)),h=Math.max(1,Math.round(img.height*scale));
      const c=document.createElement("canvas");c.width=w;c.height=h;
      const ctx=c.getContext("2d");if(!ctx){reject(Error("Canvas unavailable"));return}
      ctx.drawImage(img,0,0,w,h);
      const d=ctx.getImageData(0,0,w,h).data;
      const idx=(x:number,y:number)=>y*w+x;
      const transparent=new Uint8Array(w*h);
      const dark=new Uint8Array(w*h);
      for(let y=0;y<h;y++) for(let x=0;x<w;x++){
        const i=idx(x,y)*4,a=d[i+3],r=d[i],g=d[i+1],b=d[i+2];
        // Treat only genuinely transparent pixels as photo holes. Semi-transparent
        // anti-aliased artwork remains on top of the photo instead of enlarging it.
        transparent[idx(x,y)]=a<=28?1:0;
        dark[idx(x,y)]=(a>=220 && r<=34 && g<=34 && b<=34)?1:0;
      }
      type Comp={minX:number;minY:number;maxX:number;maxY:number;area:number;touch:boolean};
      const flood=(mask:Uint8Array):Comp[]=>{
        const seen=new Uint8Array(w*h),components:Comp[]=[];
        const qx=new Int32Array(w*h),qy=new Int32Array(w*h);
        for(let sy=0;sy<h;sy++) for(let sx=0;sx<w;sx++){
          const start=idx(sx,sy); if(!mask[start]||seen[start]) continue;
          let head=0,tail=0; qx[tail]=sx;qy[tail]=sy;tail++;seen[start]=1;
          let minX=sx,minY=sy,maxX=sx,maxY=sy,area=0,touch=false;
          while(head<tail){
            const x=qx[head],y=qy[head];head++;area++;
            if(x===0||y===0||x===w-1||y===h-1)touch=true;
            if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;
            // 8-neighbour connectivity prevents anti-aliased diagonal corners from
            // splitting one photo hole into several small components.
            for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++){
              if(!dx&&!dy)continue;
              const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;
              const j=idx(nx,ny);if(mask[j]&&!seen[j]){seen[j]=1;qx[tail]=nx;qy[tail]=ny;tail++;}
            }
          }
          components.push({minX,minY,maxX,maxY,area,touch});
        }
        return components;
      };
      const score=(c:Comp)=>{
        const bw=c.maxX-c.minX+1,bh=c.maxY-c.minY+1,box=bw*bh;
        const fill=c.area/box;
        const areaRatio=box/(w*h);
        const aspect=bw/bh;
        // Photo slots are usually substantial rectangles. Strongly penalize
        // tiny decorative transparent holes and very thin ornaments.
        const sizeScore=Math.min(1,areaRatio/.035);
        const fillScore=Math.min(1,fill/.58);
        const aspectScore=(aspect>=.28&&aspect<=2.8)?1:Math.max(0,.45-Math.abs(Math.log(aspect/1.0))*.18);
        return sizeScore*.42+fillScore*.34+aspectScore*.24;
      };
      const choose=(mask:Uint8Array,minAreaRatio:number):Comp[]=>{
        return flood(mask).filter(c=>{
          if(c.touch)return false;
          const bw=c.maxX-c.minX+1,bh=c.maxY-c.minY+1,box=bw*bh;
          const areaRatio=box/(w*h),aspect=bw/bh,fill=c.area/box;
          return areaRatio>=minAreaRatio && areaRatio<=.72 && aspect>=.28 && aspect<=2.8 && fill>=.50;
        }).sort((a,b)=>score(b)-score(a));
      };

      let comps=choose(transparent,.018);
      let shape:"transparent"|"dark"="transparent";
      if(comps.length===0){
        comps=choose(dark,.028);
        shape="dark";
      }

      // Keep the strongest candidates, then ALWAYS order them by physical
      // position (top-to-bottom, left-to-right). Never order by area: two slots
      // can have different sizes and must still receive photos in visual order.
      const selected=comps.slice(0,12).sort((a,b)=>{
        const ay=(a.minY+a.maxY)/2,by=(b.minY+b.maxY)/2;
        const rowTolerance=Math.max(4,h*.035);
        if(Math.abs(ay-by)>rowTolerance)return ay-by;
        return ((a.minX+a.maxX)/2)-((b.minX+b.maxX)/2);
      });
      const slots=selected.map(c=>({
        x:c.minX/w,y:c.minY/h,
        w:(c.maxX-c.minX+1)/w,h:(c.maxY-c.minY+1)/h,
        area:c.area/(w*h),shape
      }));
      resolve({width:img.width,height:img.height,slots});
    };
    img.onerror=()=>reject(Error("Không đọc được template PNG"));img.src=src;
  });
}
function templateSlotBoxes(slots:TemplateSlot[],W:number,H:number,padding=0){
  return slots.map(s=>{
    const x=s.x*W,y=s.y*H,w=s.w*W,h=s.h*H;
    return [x+padding,y+padding,Math.max(1,w-padding*2),Math.max(1,h-padding*2)] as [number,number,number,number];
  });
}
function drawTemplatePhoto(ctx:CanvasRenderingContext2D,img:HTMLImageElement,box:[number,number,number,number],slot:TemplateSlot){
  const [x,y,w,h]=box;
  const zoom=Math.max(.6,Math.min(3,slot.zoom??1));
  const ox=Math.max(-1,Math.min(1,slot.ox??0));
  const oy=Math.max(-1,Math.min(1,slot.oy??0));
  // IMPORTANT: clip each photo to its own slot. This makes export use the
  // exact same visible bounds as the Template Studio preview and prevents a
  // zoomed/dragged photo from bleeding into the neighbouring slot.
  ctx.save();
  ctx.beginPath();
  ctx.rect(x,y,w,h);
  ctx.clip();
  const base=Math.max(w/img.width,h/img.height);
  const dw=img.width*base*zoom,dh=img.height*base*zoom;
  const cx=x+w/2+ox*w,cy=y+h/2+oy*h;
  ctx.drawImage(img,cx-dw/2,cy-dh/2,dw,dh);
  ctx.restore();
}

function sharpenRegion(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,amount:number){
  const strength=Math.max(0,Math.min(.65,amount/30));
  const left=Math.max(0,Math.floor(x)),top=Math.max(0,Math.floor(y));
  const right=Math.min(ctx.canvas.width,Math.ceil(x+w)),bottom=Math.min(ctx.canvas.height,Math.ceil(y+h));
  const width=right-left,height=bottom-top;
  if(strength<=0||width<3||height<3)return;
  try{
    const image=ctx.getImageData(left,top,width,height),src=new Uint8ClampedArray(image.data),dst=image.data;
    for(let py=1;py<height-1;py++)for(let px=1;px<width-1;px++){
      const i=(py*width+px)*4;
      for(let c=0;c<3;c++){
        const blur=(src[i-4+c]+src[i+4+c]+src[i-width*4+c]+src[i+width*4+c])*.25;
        dst[i+c]=Math.max(0,Math.min(255,src[i+c]+(src[i+c]-blur)*strength));
      }
    }
    ctx.putImageData(image,left,top);
  }catch{
    // Some browsers restrict pixel reads on oversized canvases. Keep the original render.
  }
}
/**
 * Final export pass: apply a subtle unsharp mask to the fully composed image
 * after filters, layout, template artwork, captions and effects are complete.
 * Process in horizontal tiles to keep peak memory use reasonable on Android.
 */
function adjustColorTones(ctx:CanvasRenderingContext2D,temperature:number,highlights:number,shadows:number){
  if(!temperature&&!highlights&&!shadows)return;
  const width=ctx.canvas.width,height=ctx.canvas.height,tileHeight=128;
  const temp=temperature/100,hi=highlights/100,sh=shadows/100;
  for(let top=0;top<height;top+=tileHeight){
    const h=Math.min(tileHeight,height-top);
    const image=ctx.getImageData(0,top,width,h),d=image.data;
    for(let i=0;i<d.length;i+=4){
      const r=d[i],g=d[i+1],b=d[i+2];
      const lum=(.2126*r+.7152*g+.0722*b)/255;
      const shadowWeight=Math.pow(1-lum,2),highlightWeight=Math.pow(lum,2);
      const tone=sh*shadowWeight*62+hi*highlightWeight*62;
      d[i]=Math.max(0,Math.min(255,r+temp*24+tone));
      d[i+1]=Math.max(0,Math.min(255,g+temp*2+tone*.72));
      d[i+2]=Math.max(0,Math.min(255,b-temp*24+tone*.48));
    }
    ctx.putImageData(image,0,top);
  }
}
function sharpenFinalExport(ctx:CanvasRenderingContext2D){
  const width=ctx.canvas.width,height=ctx.canvas.height;
  const tileHeight=192,strength=.16;
  if(width<3||height<3)return;
  for(let top=0;top<height;top+=tileHeight){
    const y0=Math.max(0,top-1);
    const yEnd=Math.min(height,top+tileHeight+1);
    const image=ctx.getImageData(0,y0,width,yEnd-y0);
    const pixels=image.data;
    const source=new Uint8ClampedArray(pixels);
    const rows=image.height;
    const first=Math.max(1,top-y0);
    const last=Math.min(rows-1,top+tileHeight-y0,height-y0);
    for(let y=first;y<last;y++){
      for(let x=1;x<width-1;x++){
        const i=(y*width+x)*4;
        for(let channel=0;channel<3;channel++){
          const blur=(source[i-4+channel]+source[i+4+channel]+source[i-width*4+channel]+source[i+width*4+channel])*.25;
          pixels[i+channel]=Math.max(0,Math.min(255,source[i+channel]+(source[i+channel]-blur)*strength));
        }
      }
    }
    ctx.putImageData(image,0,y0);
  }
}

function templateOutputSize(tw:number,th:number,maxSide=3600):[number,number]{
  // Template is always scaled uniformly. Never stretch width/height independently.
  const w=Math.max(1,tw),h=Math.max(1,th);
  const scale=Math.min(1,maxSide/Math.max(w,h));
  return [Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale))];
}
export default function Home(){
 const video=useRef<HTMLVideoElement>(null);const stream=useRef<MediaStream|null>(null);const shooting=useRef(false);
 const [tab,setTab]=useState<Tab>("home"),[dark,setDark]=useState(false),[active,setActive]=useState(false),[facing,setFacing]=useState<"user"|"environment">("user");
 const [status,setStatus]=useState("Sẵn sàng chụp"),[count,setCount]=useState(0),[filter,setFilter]=useState("Gốc"),[zoom,setZoom]=useState(1),[beauty,setBeauty]=useState(0),[shots,setShots]=useState<StoredPhoto[]>([]),[toast,setToast]=useState("");
 const [boothOpen,setBoothOpen]=useState(false),[booth,setBooth]=useState<BoothOptions>(defaults),[pending,setPending]=useState<Shot[]>([]),[editorOpen,setEditorOpen]=useState(false),[retake,setRetake]=useState<number|null>(null);
 const [layout,setLayout]=useState<LayoutId>("grid"),[bg,setBg]=useState(defaults.background),[customBg,setCustomBg]=useState<string|null>(null),[frame,setFrame]=useState("#fff"),[pattern,setPattern]=useState(""),[caption,setCaption]=useState("Ngày"),[customText,setCustomText]=useState(""),[font,setFont]=useState("Hiện đại");
 const [brightness,setBrightness]=useState(0),[contrast,setContrast]=useState(0),[saturation,setSaturation]=useState(0),[sharpness,setSharpness]=useState(0),[temperature,setTemperature]=useState(0),[highlights,setHighlights]=useState(0),[shadows,setShadows]=useState(0),[enhancePreset,setEnhancePreset]=useState("Tự nhiên"),[softGlow,setSoftGlow]=useState(false),[vignette,setVignette]=useState(0),[blurBg,setBlurBg]=useState(0),[radius,setRadius]=useState(20),[padding,setPadding]=useState(40),[sticker,setSticker]=useState<Sticker[]>([]),[captionSize,setCaptionSize]=useState(32),[captionColor,setCaptionColor]=useState("#fff"),[captionPos,setCaptionPos]=useState<"top"|"bottom">("bottom"),[editorZoom,setEditorZoom]=useState(1),[timestamp,setTimestamp]=useState(false),[lightLeak,setLightLeak]=useState(false),[grain,setGrain]=useState(false),[chromatic,setChromatic]=useState(false),[customFrame,setCustomFrame]=useState<string|null>(null),[templatePng,setTemplatePng]=useState<string|null>(null),[templateSlots,setTemplateSlots]=useState<TemplateSlot[]>([]),[templateSize,setTemplateSize]=useState<[number,number]>([4,3]),[templateStatus,setTemplateStatus]=useState("Chưa có template"),[templateCalibrate,setTemplateCalibrate]=useState(false),[selectedTemplateSlot,setSelectedTemplateSlot]=useState(0),[templatePresetName,setTemplatePresetName]=useState(""),[templatePresets,setTemplatePresets]=useState<string[]>([]);
 const dragTemplate=useRef<{index:number;startX:number;startY:number;ox:number;oy:number}|null>(null);
 const notify=(m:string)=>{setToast(m);setTimeout(()=>setToast(""),2500)};
 useEffect(()=>{let alive=true;(async()=>{try{
   const legacy=localStorage.getItem("lh-ptb-template-presets-data-v370");
   if(legacy){const records=JSON.parse(legacy);if(Array.isArray(records)){for(const item of records){if(item?.name&&item?.png&&item?.size&&item?.slots)await persistTemplatePreset({name:String(item.name),png:String(item.png),size:item.size,slots:item.slots});}}localStorage.removeItem("lh-ptb-template-presets-data-v370");localStorage.removeItem("lh-ptb-template-presets-v370");}
   const names=await listTemplatePresets();if(alive)setTemplatePresets(names);
 }catch{if(alive)notify("Không thể tải thư viện Template")}})();return()=>{alive=false}},[]);
 function updateTemplateSlot(index:number,patch:Partial<TemplateSlot>){setTemplateSlots(prev=>prev.map((slot,i)=>i===index?{...slot,...patch}:slot));}
 function resetTemplateSlot(index:number){const s=templateSlots[index];if(!s)return;updateTemplateSlot(index,{zoom:1,ox:0,oy:0});}
 function resetAllTemplateSlots(){setTemplateSlots(prev=>prev.map(s=>({...s,zoom:1,ox:0,oy:0})));notify("Đã khôi phục vị trí tất cả ô ảnh");}
 function nudgeTemplateSlot(index:number,dx:number,dy:number){const s=templateSlots[index];if(!s)return;updateTemplateSlot(index,{ox:Math.max(-.8,Math.min(.8,(s.ox??0)+dx)),oy:Math.max(-.8,Math.min(.8,(s.oy??0)+dy))});}
 function handleTemplatePointerDown(index:number,e:React.PointerEvent<HTMLElement>){if(!templateCalibrate)return;setSelectedTemplateSlot(index);e.currentTarget.setPointerCapture?.(e.pointerId);const s=templateSlots[index];dragTemplate.current={index,startX:e.clientX,startY:e.clientY,ox:s?.ox??0,oy:s?.oy??0};}
 function handleTemplatePointerMove(e:React.PointerEvent<HTMLElement>){const d=dragTemplate.current;if(!d)return;const rect=e.currentTarget.getBoundingClientRect();const s=templateSlots[d.index];if(!s||!rect.width||!rect.height)return;updateTemplateSlot(d.index,{ox:Math.max(-.8,Math.min(.8,d.ox+(e.clientX-d.startX)/rect.width)),oy:Math.max(-.8,Math.min(.8,d.oy+(e.clientY-d.startY)/rect.height))});}
 function handleTemplatePointerUp(){dragTemplate.current=null;}
 useEffect(()=>{const stop=()=>{dragTemplate.current=null};window.addEventListener("pointerup",stop);return()=>window.removeEventListener("pointerup",stop)},[]);
 async function saveTemplatePreset(){
  if(!templatePng||!templateSlots.length)return notify("Hãy tải Template PNG trước");
  const name=templatePresetName.trim()||`Template ${templatePresets.length+1}`;
  try{
    await persistTemplatePreset({name,png:templatePng,size:templateSize,slots:templateSlots});
    const names=await listTemplatePresets();setTemplatePresets(names);setTemplatePresetName("");
    notify(`Đã lưu preset ${name} vào thư viện thiết bị`);
  }catch{notify("Không thể lưu template. Hãy kiểm tra dung lượng trình duyệt")}
 }
 async function loadTemplatePreset(name:string){
  try{
    const item=await getTemplatePreset(name);if(!item)return;
    const png=await blobToDataUrl(item.png);
    setTemplatePng(png);setTemplateSize(item.size);setTemplateSlots(item.slots as TemplateSlot[]);
    setLayout("template");setTemplateStatus(`Preset: ${name}`);setSelectedTemplateSlot(0);
    notify(`Đã tải ${name}`);
  }catch{notify("Không thể tải preset")}
 }
 function applyEnhancePreset(name:string){
   setEnhancePreset(name);
   if(name==="Tự nhiên"){setFilter("Gốc");setBrightness(0);setContrast(0);setSaturation(0);setSharpness(0);setVignette(0);setSoftGlow(false);setGrain(false);setLightLeak(false)}
   else if(name==="Tự động đẹp"){setFilter("Gốc");setBrightness(8);setContrast(8);setSaturation(6);setSharpness(10);setVignette(10);setSoftGlow(true);setGrain(false)}
   else if(name==="Trong trẻo"){setFilter("Gốc");setBrightness(7);setContrast(10);setSaturation(10);setSharpness(14);setVignette(4);setSoftGlow(true);setGrain(false)}
   else if(name==="Chân dung"){setFilter("Mộng mơ");setBrightness(10);setContrast(3);setSaturation(2);setSharpness(8);setVignette(8);setSoftGlow(true);setGrain(false)}
   else if(name==="Film nhẹ"){setBrightness(3);setContrast(8);setSaturation(-6);setSharpness(5);setVignette(18);setSoftGlow(false);setGrain(true);setFilter("Phim")}
   else if(name==="Ấm áp"){setBrightness(7);setContrast(5);setSaturation(8);setSharpness(7);setVignette(7);setSoftGlow(true);setGrain(false);setFilter("Warm")}
 }

 useEffect(()=>{getPhotos().then(setShots).catch(()=>notify("Không đọc được thư viện"));const t=setInterval(()=>getPhotos().then(setShots).catch(()=>{}),30000);return()=>clearInterval(t)},[]);
 useEffect(()=>{const t=setInterval(()=>purgeExpiredPhotos().then(()=>getPhotos().then(setShots)),60000);return()=>clearInterval(t)},[]);
 useEffect(()=>()=>stream.current?.getTracks().forEach(t=>t.stop()),[]);
 useEffect(()=>{const saved=localStorage.getItem("ptb-v3-settings");if(saved)try{const x=JSON.parse(saved);setDark(!!x.dark);if(x.booth)setBooth({...defaults,...x.booth})}catch{}},[]);
 useEffect(()=>{localStorage.setItem("ptb-v3-settings",JSON.stringify({dark,booth}))},[dark,booth]);
  // Reflect the selected Photo Booth preset style on the live camera immediately.
  useEffect(()=>{setFilter(booth.style)},[booth.style]);
 const videoFilter=useMemo(()=>`${FILTERS[filter]||"none"} brightness(${1+brightness/100+beauty*.02}) contrast(${1+contrast/100-beauty*.008}) saturate(${1+saturation/100})`,[filter,brightness,contrast,saturation,beauty]);
 async function startCamera(side=facing){
  if(!navigator.mediaDevices?.getUserMedia){
    setStatus("Trình duyệt không hỗ trợ camera. Hãy mở ứng dụng bằng Chrome hoặc trình duyệt tương thích.");
    setActive(false);return;
  }
  stream.current?.getTracks().forEach(t=>t.stop());
  stream.current=null;setActive(false);
  // Negotiate progressively: some phones/browsers reject high-resolution or
  // facingMode constraints even though their camera is available.
  const attempts:MediaStreamConstraints[]=[
    {audio:false,video:{facingMode:{ideal:side},width:{ideal:1920},height:{ideal:1080},aspectRatio:{ideal:16/9}}},
    {audio:false,video:{facingMode:{ideal:side},width:{ideal:1280},height:{ideal:720}}},
    {audio:false,video:{facingMode:{ideal:side}}},
    {audio:false,video:true}
  ];
  let opened:MediaStream|null=null;
  for(const constraints of attempts){
    try{opened=await navigator.mediaDevices.getUserMedia(constraints);break}catch{}
  }
  if(!opened){
    setStatus("Không mở được camera. Hãy cấp quyền camera, đóng ứng dụng khác đang dùng camera và thử lại.");
    setActive(false);return;
  }
  try{
    stream.current=opened;
    const track=opened.getVideoTracks()[0];
    // Enable continuous autofocus only when the device explicitly reports support.
    if(track?.getCapabilities){
      const caps=track.getCapabilities() as MediaTrackCapabilities & {focusMode?:string[]};
      if(caps.focusMode?.includes("continuous")){
        try{await track.applyConstraints({advanced:[{focusMode:"continuous"}] as unknown as MediaTrackConstraintSet[]})}catch{}
      }
    }
    if(!video.current)throw new Error("Video element unavailable");
    video.current.srcObject=opened;
    await video.current.play();
    if(!video.current.videoWidth){
      await new Promise<void>((resolve,reject)=>{
        const el=video.current!;
        const timer=window.setTimeout(()=>reject(new Error("Camera metadata timeout")),5000);
        el.onloadedmetadata=()=>{window.clearTimeout(timer);resolve()};
        if(el.videoWidth) {window.clearTimeout(timer);resolve()}
      });
    }
    const w=video.current.videoWidth,h=video.current.videoHeight;
    setActive(true);
    setStatus(w&&h?`Camera sẵn sàng · ${w} × ${h}`:"Camera đã sẵn sàng");
  }catch{
    opened.getTracks().forEach(t=>t.stop());
    if(stream.current===opened)stream.current=null;
    setActive(false);
    setStatus("Camera đã mở nhưng không phát được hình. Hãy thử đổi camera hoặc tải lại ứng dụng.");
  }
 }
 function stopCamera(){stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;setActive(false)}
 async function switchCamera(){const n=facing==="user"?"environment":"user";setFacing(n);await startCamera(n)}
 function capture():Shot|null{
  const v=video.current;
  if(!v||v.readyState<2||!v.videoWidth||!v.videoHeight)return null;
  const max=booth.quality==="maximum"?3840:booth.quality==="high"?2560:1600;
  const rect=v.getBoundingClientRect();
  const targetAspect=rect.width>0&&rect.height>0?rect.width/rect.height:v.videoWidth/v.videoHeight;
  const sourceAspect=v.videoWidth/v.videoHeight;
  let sw:number,sh:number;
  if(sourceAspect>targetAspect){sh=v.videoHeight;sw=sh*targetAspect}
  else{sw=v.videoWidth;sh=sw/targetAspect}
  sw/=zoom;sh/=zoom;
  const sx=(v.videoWidth-sw)/2,sy=(v.videoHeight-sh)/2;
  const scale=Math.min(1,max/Math.max(sw,sh));
  const c=document.createElement("canvas");c.width=Math.max(1,Math.round(sw*scale));c.height=Math.max(1,Math.round(sh*scale));
  const ctx=c.getContext("2d");if(!ctx)return null;
  ctx.filter=videoFilter;
  if(facing==="user"){ctx.translate(c.width,0);ctx.scale(-1,1)}
  ctx.drawImage(v,sx,sy,sw,sh,0,0,c.width,c.height);
  return{id:uid(),src:c.toDataURL("image/jpeg",.97),createdAt:Date.now()};
 }
 function boothTargetCount(){
  if(booth.layout==="twoThree")return 6;
  if(booth.layout==="double")return 2;
  if(booth.layout==="hero")return 1;
  return 4;
 }
 async function autoSaveCapture(shots:Shot[]){
  if(!shots.length)return;
  try{
   // Preserve the captured originals in the local library without discarding
   // the working copies needed by the editor and transparent PNG templates.
   for(let i=0;i<shots.length;i++){
    await saveToLibrary(shots[i].src,`LH PTB - Photo ${i+1}.jpg`);
   }
   // Recap export is independent: failure must not close or clear the editor.
   await createVideoRecap(shots);
   setPending(shots);
   setEditorOpen(true);
   setStatus(`Đã chụp ${shots.length} ảnh · Ảnh gốc đã lưu · Có thể chỉnh sửa và dùng Template`);
   notify(`Đã lưu ${shots.length} ảnh gốc. Bạn có thể tiếp tục chỉnh sửa và xuất ảnh ghép`);
  }catch{
   // Keep the captured images available even if local library saving fails.
   setPending(shots);
   setEditorOpen(true);
   setStatus("Đã chụp xong · Có lỗi khi lưu ảnh gốc, ảnh vẫn đang mở trong trình chỉnh sửa");
   notify("Có lỗi khi lưu ảnh vào thư viện. Ảnh vẫn được giữ trong trình chỉnh sửa để bạn xuất lại");
  }
 }
 async function shoot(){
  if(!active||shooting.current)return;
  shooting.current=true;
  const auto=booth.mode==="auto",target=boothTargetCount(),total=auto?target:1;
  const captured:Shot[]=[];
  try{
   for(let i=0;i<total;i++){
    for(let n=booth.timer;n>0;n--){setCount(n);await wait(1000)}
    setCount(0);
    const shot=capture();if(shot)captured.push(shot);
    if(i<total-1)await wait(700);
   }
   if(auto&&captured.length){
    applyBoothToEditor();
    setStatus(`Đã chụp ${captured.length}/${target} ảnh · Đang tự động lưu`);
    await autoSaveCapture(captured);
   }else if(!auto&&captured.length){
    const combined=[...pending,...captured].slice(0,target);
    setPending(combined);
    if(combined.length>=target){
     applyBoothToEditor();
     setStatus(`Đã chụp đủ ${combined.length}/${target} ảnh · Đang tự động lưu`);
     await autoSaveCapture(combined);
    }else{
     setStatus(`Đã chụp ${combined.length}/${target} ảnh · Tiếp tục bấm chụp để thêm ảnh`);
    }
   }
  }finally{setCount(0);shooting.current=false}
 }
 function applyBoothToEditor(){setFilter(booth.style);setLayout(booth.layout==="double"?"vertical":booth.layout==="hero"?"polaroid":booth.layout==="twoThree"?"twoThree":booth.layout==="oneFour"?"oneFour":booth.layout==="grid"?"grid":"template");setBg(booth.background);setFrame(booth.frame);setPattern(booth.pattern);setCaption(booth.caption);setCustomText(booth.customText);setFont(booth.font)}
 async function retakePending(i:number){if(shooting.current)return;if(!active)await startCamera();shooting.current=true;setRetake(i);setEditorOpen(false);try{for(let n=booth.timer;n>0;n--){setCount(n);await wait(1000)}const s=capture();if(s)setPending(p=>p.map((x,j)=>j===i?s:x))}finally{setRetake(null);setCount(0);shooting.current=false;setEditorOpen(true)}}
 async function createVideoRecap(shots:Shot[]=pending){
  if(!shots.length){notify("Chưa có ảnh để tạo recap");return}
  let recapStream:MediaStream|null=null;
  try{
    const canvas=document.createElement("canvas"); canvas.width=1280; canvas.height=720;
    const ctx=canvas.getContext("2d"); if(!ctx) throw Error("canvas");
    const mimeCandidates=["video/webm;codecs=vp9","video/webm;codecs=vp8","video/webm"];
    const mimeType=mimeCandidates.find(t=>typeof MediaRecorder!=="undefined" && MediaRecorder.isTypeSupported(t));
    if(!mimeType) throw Error("MediaRecorder unsupported");
    recapStream=canvas.captureStream(30);
    const recorder=new MediaRecorder(recapStream,{mimeType});
    const chunks:BlobPart[]=[]; recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
    const done=new Promise<void>((resolve,reject)=>{recorder.onstop=()=>resolve();recorder.onerror=()=>reject(new Error("Video recording failed"));});
    recorder.start(250);
    const imgs=await Promise.all(shots.map(x=>loadImage(x.src)));
    for(const img of imgs){ctx.fillStyle="#111";ctx.fillRect(0,0,1280,720);fitImage(ctx,img,0,0,1280,720);ctx.fillStyle="rgba(0,0,0,.22)";ctx.fillRect(0,0,1280,720);await wait(900)}
    recorder.stop(); await done;
    const blob=new Blob(chunks,{type:mimeType});if(!blob.size)throw Error("Empty video");
    downloadBlob(blob,`LH-PTB-Video-Recap-${Date.now()}.webm`);notify("Đã tạo Video Recap");
  }catch{notify("Không thể tạo Video Recap trên thiết bị này")}
  finally{recapStream?.getTracks().forEach(track=>track.stop())}
 }
 async function saveToLibrary(src:string,name:string){const item=await savePhoto({id:uid(),src,createdAt:Date.now(),name});setShots(await getPhotos());return item}
 async function renderFinal(mimeType:"image/png"|"image/jpeg"|"image/webp"="image/png"):Promise<Blob>{
  if(!pending.length) throw Error("no photos");
  if(layout==="twoThree" && pending.length < 6) throw Error("Layout 2×3 cần đủ 6 ảnh trước khi xuất.");
  const dims:Record<LayoutId,[number,number]>={
    template:[3600,3000],
    oneFour:[2400,4800],
    grid:[3600,2700],
    twoThree:[3600,4800],
    vertical:[2400,4800],
    horizontal:[4800,2400],
    threeOne:[3600,3300],
    film:[2400,5600],
    polaroid:[3600,3150]
  };
  let [W,H]=dims[layout];
  // Khi có template PNG, kích thước canvas phải bám đúng tỷ lệ và kích thước gốc của template
  // (chỉ giảm đồng đều nếu vượt giới hạn canvas an toàn của trình duyệt).
  if(templatePng && templateSlots.length){ [W,H]=templateOutputSize(templateSize[0],templateSize[1],3600); }
  const c=document.createElement("canvas");
  c.width=W;c.height=H;
  const ctx=c.getContext("2d",{alpha:false});
  if(!ctx) throw Error("Canvas unavailable");

  // 0) Template PNG tự nhận vùng ảnh: ảnh được vẽ trước, artwork PNG vẽ sau cùng.
  if(templatePng && templateSlots.length){
    const ti=await loadImage(templatePng);
    const boxes=templateSlotBoxes(templateSlots,W,H,0);
    const imgs=await Promise.all(pending.slice(0,Math.min(pending.length,templateSlots.length)).map(x=>loadImage(x.src)));
    imgs.forEach((img,index)=>{const b=boxes[index];if(!b)return;const slot=templateSlots[index]||{};ctx.save();ctx.filter=[FILTERS[filter]||"none",`brightness(${1+brightness/100})`,`contrast(${1+contrast/100+sharpness/220})`,`saturate(${1+saturation/100})`].filter(Boolean).join(" ");drawTemplatePhoto(ctx,img,b,slot);ctx.restore();sharpenRegion(ctx,b[0],b[1],b[2],b[3],sharpness);});
    // Toàn bộ artwork của template nằm trên ảnh. Các vùng trong suốt tự lộ ảnh phía dưới.
    ctx.drawImage(ti,0,0,W,H);
    if(softGlow){const glow=ctx.createRadialGradient(W*.5,H*.38,Math.min(W,H)*.08,W*.5,H*.42,Math.max(W,H)*.72);glow.addColorStop(0,"rgba(255,255,255,.16)");glow.addColorStop(.55,"rgba(255,244,226,.05)");glow.addColorStop(1,"rgba(255,255,255,0)");ctx.save();ctx.globalCompositeOperation="screen";ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);ctx.restore();}
    if(lightLeak){const g=ctx.createLinearGradient(0,0,W*.72,H*.55);g.addColorStop(0,"rgba(255,110,150,.35)");g.addColorStop(.45,"rgba(255,210,120,.14)");g.addColorStop(1,"rgba(255,255,255,0)");ctx.save();ctx.globalCompositeOperation="screen";ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.restore();}
    if(grain){ctx.save();ctx.globalAlpha=.06;ctx.fillStyle="#fff";const step=Math.max(7,Math.round(Math.min(W,H)/420));for(let y=0;y<H;y+=step)for(let x=0;x<W;x+=step*2)if(Math.random()>.52)ctx.fillRect(x,y,step,step);ctx.restore();}
    if(vignette>0){const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.25,W/2,H/2,Math.max(W,H)*.72);g.addColorStop(0,"transparent");g.addColorStop(1,`rgba(0,0,0,${vignette/100})`);ctx.fillStyle=g;ctx.fillRect(0,0,W,H);}
    sticker.forEach(s=>drawSticker(ctx,s,W,H));
    if(caption!=="Không"){ctx.save();ctx.fillStyle=captionColor;ctx.font=`800 ${Math.round(captionSize*W/900)}px ${FONT_MAP[font]||"Arial"}`;ctx.textAlign="center";ctx.shadowColor="rgba(0,0,0,.55)";ctx.shadowBlur=14;const text=caption==="Chữ riêng"?customText:caption==="Cả hai"?`${customText} • ${new Date().toLocaleDateString("vi-VN")}`:new Date().toLocaleDateString("vi-VN");ctx.fillText(text,W/2,captionPos==="bottom"?H-Math.round(38*W/900):Math.round(captionSize*W/900)+36);ctx.restore();}
    // Final sharpening happens only after the selected template and all effects are composed.
    adjustColorTones(ctx,temperature,highlights,shadows);sharpenFinalExport(ctx);
    return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error("Export failed")),mimeType,mimeType==="image/png"?undefined:.94));
  }

  // 1) Nền chính nằm phía sau ảnh. Blur chỉ áp dụng cho background, không làm mờ ảnh.
  await paintBackgroundLayer(ctx,W,H,bg,customBg,blurBg);
  patternPaint(ctx,pattern,W,H);

  const exportPhotoCount = layout==="twoThree" ? 6 : 4;
  const imgs=await Promise.all(pending.slice(0,exportPhotoCount).map(x=>loadImage(x.src)));
  const p=Math.max(40,padding*2);
  const gap=Math.max(20,Math.min(80,padding));
  let boxes:[number,number,number,number][]=[];

  if(layout==="oneFour"||layout==="vertical"||layout==="film"){
    const ch=(H-2*p-gap*(Math.min(imgs.length,4)-1))/Math.min(imgs.length,4);
    boxes=imgs.slice(0,4).map((_,i)=>[p,p+i*(ch+gap),W-2*p,ch]);
  }else if(layout==="twoThree"){
    const cols=2, rows=3; const cw=(W-2*p-gap)/cols, ch=(H-2*p-gap*2)/rows;
    boxes=imgs.slice(0,6).map((_,i)=>[p+(i%2)*(cw+gap),p+Math.floor(i/2)*(ch+gap),cw,ch]);
  }else if(layout==="template"){
    const cw=(W-2*p-gap)/2;
    const topH=(H-2*p-gap)*.47;
    const botH=(H-2*p-gap)-topH;
    boxes=[[p,p,cw,topH],[p+cw+gap,p,cw,topH],[p,p+topH+gap,cw,botH],[p+cw+gap,p+topH+gap,cw,botH]];
  }else if(layout==="grid"){
    const cw=(W-2*p-gap)/2,ch=(H-2*p-gap)/2;
    boxes=[[p,p,cw,ch],[p+cw+gap,p,cw,ch],[p,p+ch+gap,cw,ch],[p+cw+gap,p+ch+gap,cw,ch]];
  }else if(layout==="horizontal"){
    const cw=(W-2*p-gap*3)/4;
    boxes=imgs.map((_,i)=>[p+i*(cw+gap),p,cw,H-2*p]);
  }else if(layout==="threeOne"){
    const cw=(W-2*p-gap)/2,ch=(H-2*p-gap)/2;
    boxes=[[p,p,cw,ch],[p+cw+gap,p,cw,ch],[p,p+ch+gap,cw,ch],[p+cw+gap,p+ch+gap,cw,ch]];
  }else{
    const cw=(W-2*p-gap)/2,ch=(H-2*p-gap)/2;
    boxes=[[p,p,cw,ch],[p+cw+gap,p,cw,ch],[p,p+ch+gap,cw,ch],[p+cw+gap,p+ch+gap,cw,ch]];
  }

  // 2) Ảnh được đặt như các ô ảnh của một template, không tạo thẻ trắng lớn bao quanh ảnh.
  imgs.forEach((img,index)=>{
    const box=boxes[index]; if(!box) return;
    const [x,y,w,h]=box;
    ctx.save();
    ctx.shadowColor="rgba(0,0,0,.20)";
    ctx.shadowBlur=28;
    ctx.shadowOffsetY=8;
    ctx.fillStyle="rgba(255,255,255,.16)";
    if(layout==="template" && (index===2 || index===3)) { ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2); ctx.fill(); } else { rounded(ctx,x-4,y-4,w+8,h+8,Math.max(14,radius+4)); ctx.fill(); }
    ctx.restore();

    ctx.save();
    if(layout==="template" && (index===2 || index===3)) { ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2); ctx.clip(); }
    else { rounded(ctx,x,y,w,h,radius); ctx.clip(); }
    ctx.filter=[
      FILTERS[filter]||"none",
      `brightness(${1+brightness/100})`,
      `contrast(${1+contrast/100+sharpness/220})`,
      `saturate(${1+saturation/100})`
    ].filter(Boolean).join(" ");
    fitImage(ctx,img,x,y,w,h);
    ctx.restore();
    sharpenRegion(ctx,x,y,w,h,sharpness);

    ctx.save();
    ctx.strokeStyle=frame;
    ctx.lineWidth=layout==="template"?Math.max(6,p/14):Math.max(8,p/10);
    if(layout==="template" && (index===2 || index===3)) { ctx.beginPath(); ctx.ellipse(x+w/2,y+h/2,w/2,h/2,0,0,Math.PI*2); ctx.stroke(); }
    else { rounded(ctx,x,y,w,h,radius); ctx.stroke(); }
    ctx.restore();
  });

  // 5) Template foreground: viền, đường cong, nơ và chữ trang trí để ảnh hòa vào nền giống photobooth thật.
  if(layout==="template"){
    ctx.save();
    ctx.strokeStyle=frame;
    ctx.globalAlpha=.92;
    ctx.lineWidth=Math.max(8,p/10);
    rounded(ctx,18,18,W-36,H-36,34); ctx.stroke();
    ctx.lineWidth=5;
    ctx.beginPath(); ctx.moveTo(W*.04,H*.53); ctx.quadraticCurveTo(W*.12,H*.46,W*.22,H*.50); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W*.78,H*.50); ctx.quadraticCurveTo(W*.90,H*.44,W*.96,H*.53); ctx.stroke();
    ctx.restore();
    const deco=(text:string,x:number,y:number,size:number,rot:number)=>{ctx.save();ctx.translate(x,y);ctx.rotate(rot);ctx.font=`800 ${size}px Georgia,serif`;ctx.fillStyle=frame==="#101010"?"#fff":"#7d2736";ctx.textAlign="center";ctx.shadowColor="rgba(0,0,0,.18)";ctx.shadowBlur=5;ctx.fillText(text,0,0);ctx.restore()};
    deco("Darling",W*.50,H*.515,Math.round(W*.055),-.06);
    deco("♥",W*.075,H*.12,Math.round(W*.06),-.25); deco("♥",W*.925,H*.86,Math.round(W*.06),.25);
    deco("✦",W*.06,H*.88,Math.round(W*.045),-.1); deco("✦",W*.94,H*.14,Math.round(W*.045),.1);
    ctx.save();ctx.fillStyle=frame==="#101010"?"#fff":"#7d2736";ctx.font=`700 ${Math.round(W*.018)}px Arial`;ctx.textAlign="center";ctx.globalAlpha=.78;ctx.fillText("CAPTURING MOMENTS",W/2,H-32);ctx.restore();
  }
  // 6) Hoa tiết/khung foreground nằm trên toàn bộ composition
  patternPaint(ctx,pattern,W,H);

  if(softGlow){
    const glow=ctx.createRadialGradient(W*.5,H*.38,Math.min(W,H)*.08,W*.5,H*.42,Math.max(W,H)*.72);
    glow.addColorStop(0,"rgba(255,255,255,.16)");
    glow.addColorStop(.55,"rgba(255,244,226,.05)");
    glow.addColorStop(1,"rgba(255,255,255,0)");
    ctx.save();ctx.globalCompositeOperation="screen";ctx.fillStyle=glow;ctx.fillRect(0,0,W,H);ctx.restore();
  }

  if(lightLeak){
    const g=ctx.createLinearGradient(0,0,W*.72,H*.55);
    g.addColorStop(0,"rgba(255,110,150,.42)"); g.addColorStop(.45,"rgba(255,210,120,.18)"); g.addColorStop(1,"rgba(255,255,255,0)");
    ctx.save(); ctx.globalCompositeOperation="screen"; ctx.fillStyle=g; ctx.fillRect(0,0,W,H); ctx.restore();
  }
  if(chromatic){
    const stripe=Math.max(3,Math.round(W*.0015));
    ctx.save(); ctx.globalAlpha=.12; ctx.globalCompositeOperation="screen";
    ctx.fillStyle="#ff365f"; ctx.fillRect(-stripe,0,stripe,H);
    ctx.fillStyle="#32b5ff"; ctx.fillRect(W,0,stripe,H); ctx.restore();
  }
  if(grain){
    ctx.save(); ctx.globalAlpha=.08; ctx.fillStyle="#fff";
    const step=Math.max(7,Math.round(Math.min(W,H)/420));
    for(let y=0;y<H;y+=step) for(let x=0;x<W;x+=step*2) if(Math.random()>.52) ctx.fillRect(x,y,step,step);
    ctx.restore();
  }
  if(timestamp){
    ctx.save(); ctx.fillStyle="rgba(255,255,255,.92)"; ctx.font=`700 ${Math.round(W*.018)}px Arial`; ctx.textAlign="right"; ctx.shadowColor="rgba(0,0,0,.55)"; ctx.shadowBlur=8;
    ctx.fillText(new Date().toLocaleString("vi-VN"),W-36,H-36); ctx.restore();
  }
  if(vignette>0){
    const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.25,W/2,H/2,Math.max(W,H)*.72);
    g.addColorStop(0,"transparent");
    g.addColorStop(1,`rgba(0,0,0,${vignette/100})`);
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }

  sticker.forEach(s=>drawSticker(ctx,s,W,H));

  if(caption!=="Không"){
    ctx.save();ctx.fillStyle=captionColor;ctx.font=`800 ${Math.round(captionSize*W/900)}px ${FONT_MAP[font]||"Arial"}`;ctx.textAlign="center";ctx.shadowColor="rgba(0,0,0,.55)";ctx.shadowBlur=14;
    const text=caption==="Chữ riêng"?customText:caption==="Cả hai"?`${customText} • ${new Date().toLocaleDateString("vi-VN")}`:new Date().toLocaleDateString("vi-VN");
    ctx.fillText(text,W/2,captionPos==="bottom"?H-Math.round(38*W/900):Math.round(captionSize*W/900)+36);
    ctx.restore();
  }

  if(customFrame){
    try{const fi=await loadImage(customFrame);ctx.save();ctx.globalAlpha=1;ctx.drawImage(fi,0,0,W,H);ctx.restore();}catch{}
  }

  // Final sharpening happens after capture, layout, filters, decorations and editor options.
  adjustColorTones(ctx,temperature,highlights,shadows);sharpenFinalExport(ctx);
  return new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error("Export failed")),mimeType,mimeType==="image/png"?undefined:.94));
 }
 async function downloadRendered(format:"png"|"jpg"|"webp"){
  try{
    const mime=format==="jpg"?"image/jpeg":format==="webp"?"image/webp":"image/png";
    const blob=await renderFinal(mime);
    const actualFormat=blob.type==="image/webp"?"webp":blob.type==="image/jpeg"?"jpg":"png";
    downloadBlob(blob,`LH-PTB-${Date.now()}.${actualFormat}`);
    notify(`Đã xuất ảnh ${actualFormat.toUpperCase()}`);
  }catch{notify("Không thể xuất ảnh. Hãy kiểm tra số lượng ảnh và dung lượng")}
 }
 async function saveComposite(clear=true){
  try{
    const blob=await renderFinal();
    const fileName=`PTB-PhotoBooth-${new Date().toISOString().replace(/[:.]/g,"-")}.png`;
    const result=await saveImageToDevice(blob,fileName);
    const reader=new FileReader();
    const dataUrl=await new Promise<string>((resolve,reject)=>{reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(reader.error||Error("Read failed"));reader.readAsDataURL(blob)});
    await saveToLibrary(dataUrl,"LH PTB - ảnh chất lượng cao.png");
    if(clear && result!=="cancelled"){setPending([]);setEditorOpen(false)}
    notify(result==="cancelled"?"Đã giữ ảnh trong thư viện tạm 30 phút":"Đã lưu ảnh chất lượng cao vào thư viện tạm 30 phút");
    return true;
  }catch{notify("Không thể xuất ảnh chất lượng cao");return false}
 }
 async function saveSeparate(clear=true){const copy=[...pending];for(let i=0;i<copy.length;i++){downloadBlob(dataURLToBlob(copy[i].src),`ptb-photo-${i+1}.jpg`);await saveToLibrary(copy[i].src,`Photo ${i+1}.jpg`)}if(clear){setPending([]);setEditorOpen(false)}notify(`Đã lưu ${copy.length} ảnh riêng`)}
 async function saveBoth(){const copy=[...pending];const compositeSaved=await saveComposite(false);if(!compositeSaved)return;for(let i=0;i<copy.length;i++){downloadBlob(dataURLToBlob(copy[i].src),`ptb-photo-${i+1}.jpg`);await saveToLibrary(copy[i].src,`Photo ${i+1}.jpg`)}setPending([]);setEditorOpen(false);notify(`Đã lưu ảnh ghép + ${copy.length} ảnh riêng`)}
 async function replacePendingPhoto(index:number,file:File){
  if(!file.type.startsWith("image/")) return;
  const r=new FileReader(); await new Promise<void>(resolve=>{r.onload=()=>{setPending(p=>p.map((x,i)=>i===index?{...x,src:String(r.result),createdAt:Date.now()}:x));resolve()};r.readAsDataURL(file)});
  notify(`Đã thay ảnh ${index+1}`);
 }
 async function importImages(files:FileList|File[]){for(const f of Array.from(files)){if(!f.type.startsWith("image/"))continue;const r=new FileReader();await new Promise<void>(resolve=>{r.onload=async()=>{await saveToLibrary(String(r.result),f.name);resolve()};r.readAsDataURL(f)})}notify("Đã thêm ảnh")}
 async function deleteOne(id:string){await deletePhoto(id);setShots(await getPhotos());notify("Đã xoá ảnh")}
 async function clearAll(){if(confirm("Xoá toàn bộ ảnh?")){await clearPhotos();setShots([]);notify("Đã xoá thư viện")}}
 function addSticker(glyph:string){setSticker(p=>[...p,{id:uid(),glyph,x:.5+Math.random()*.2-.1,y:.5+Math.random()*.2-.1,size:56}])}
 return <main className={dark?"shell dark":"shell"}>
 <header className="topbar"><button className="brandBtn" onClick={()=>setTab("home")}><span className="appLogo">PT</span><span><b>LH PTB</b><small>PHOTO STUDIO</small></span></button><div className="topActions"><button onClick={()=>setTab("home")}>▦</button><button onClick={()=>setTab("settings")}>⚙</button></div></header>
 {tab==="home"&&<section className="page"><div className="welcome"><div><span className="eyebrow">TEMPORARY WEB LIBRARY</span><h1>Khoảnh khắc<br/>của bạn</h1></div><button className="roundIcon" onClick={()=>setTab("camera")}>+</button></div><div className="quickCards"><button onClick={()=>setTab("camera")}><b>📷 Chụp Photo Booth</b><span>Tự động 4 ảnh • Editor v3</span></button><button onClick={()=>document.getElementById("import")?.click()}><b>＋ Thêm ảnh</b><span>Tự xoá sau 30 phút</span></button></div><input id="import" type="file" accept="image/*" multiple hidden onChange={e=>{if(e.target.files)importImages(e.target.files);e.currentTarget.value=""}}/><div className="sectionTitle"><h2>Thư viện tạm thời</h2><span>{shots.length} ảnh • 30 phút</span></div>{shots.length?<><div className="profileGrid">{shots.map(s=><div key={s.id}><img src={s.src} alt={s.name||"Ảnh"}/><div className="shotMeta"><span>{Math.max(0,Math.ceil((s.expiresAt-Date.now())/60000))} phút</span><button onClick={()=>downloadBlob(dataURLToBlob(s.src),`ptb-${s.id}.png`)}>Tải</button><button onClick={()=>deleteOne(s.id)}>Xoá</button></div></div>)}</div><button className="wideSecondary" onClick={clearAll}>Xoá toàn bộ</button></>:<div className="emptyGrid"><span>📷</span><b>Chưa có ảnh</b><p>Ảnh được lưu trong IndexedDB của trình duyệt và tự xoá sau 30 phút.</p><button className="primary" onClick={()=>setTab("camera")}>Mở camera</button></div>}</section>}
 {tab==="camera"&&<section className="page cameraPage"><div className="cameraCard"><video ref={video} playsInline muted style={{filter:videoFilter,transform:`scale(${zoom}) scaleX(${facing==="user"?-1:1})`}}/><div className="cameraShade"/><div className="cameraMeta"><span>{active?"● CAMERA READY":"○ CAMERA OFF"}</span><button onClick={()=>{stopCamera();setTab("home")}}>×</button></div>{count>0&&<div className="countdown">{count}</div>}{!active&&<div className="cameraEmpty"><div className="cameraGlyph">📷</div><h2>Camera chưa mở</h2><p>Camera dùng độ phân giải cao khi thiết bị hỗ trợ.</p><button className="primary" onClick={()=>startCamera()}>Mở camera</button></div>}</div>
 <div className="cameraTools"><label>Hẹn giờ<select value={booth.timer} onChange={e=>setBooth({...booth,timer:+e.target.value})}>{[0,3,5,10].map(n=><option key={n} value={n}>{n?`${n} giây`:"Không"}</option>)}</select></label><label>Bộ lọc<select value={filter} onChange={e=>setFilter(e.target.value)}>{Object.keys(FILTERS).map(x=><option key={x}>{x}</option>)}</select></label><label>Zoom <b>{zoom.toFixed(1)}×</b><input className="range" type="range" min="1" max="2" step=".1" value={zoom} onChange={e=>setZoom(+e.target.value)}/></label></div>
 <div className="beautyBar"><span>Beauty</span><input className="range" type="range" min="0" max="10" value={beauty} onChange={e=>setBeauty(+e.target.value)}/><b>{beauty}/10</b></div><div className="shutterRow"><button className="boothButton" onClick={()=>setBoothOpen(true)}>▦<span>Photo Booth</span></button><button className="shutter" disabled={!active} onClick={shoot}><i/></button><button className="flipButton" disabled={!active} onClick={switchCamera}>↻</button></div><div className="cameraBottom"><button onClick={stopCamera}>Tắt camera</button><span>{status}</span><label className="uploadBtn">+ Ảnh<input type="file" accept="image/*" multiple hidden onChange={e=>{if(e.target.files)importImages(e.target.files);e.currentTarget.value=""}}/></label></div>
 <div className="advancedPanel"><b>Điều chỉnh nhanh</b><div><label>Sáng <input type="range" min="-30" max="30" value={brightness} onChange={e=>setBrightness(+e.target.value)}/></label><label>Tương phản <input type="range" min="-30" max="30" value={contrast} onChange={e=>setContrast(+e.target.value)}/></label><label>Màu <input type="range" min="-30" max="30" value={saturation} onChange={e=>setSaturation(+e.target.value)}/></label></div></div></section>}
 {tab==="settings"&&<section className="page"><div className="pageHeading"><span className="eyebrow">SETTINGS</span><h1>Cài đặt</h1><p>Thư viện là tạm thời trên trình duyệt. Mỗi ảnh có thời hạn 30 phút và được tự động xoá.</p></div><div className="settingsList"><button onClick={()=>setDark(v=>!v)}><span>◐</span><div><b>Giao diện tối</b><small>Đổi giao diện</small></div><i>{dark?"Bật":"Tắt"}</i></button><button onClick={()=>setBoothOpen(true)}><span>▦</span><div><b>Photo Booth</b><small>4 ảnh, layout, khung, chất lượng</small></div><i>→</i></button><button onClick={clearAll}><span>⌫</span><div><b>Xoá thư viện ngay</b><small>Không thể hoàn tác</small></div><i>→</i></button></div><div className="privacyBox"><b>Quyền riêng tư & thời hạn</b><p>Ứng dụng không cần tài khoản. Ảnh được lưu bằng IndexedDB trên thiết bị hiện tại, không tự upload lên máy chủ. Sau {PHOTO_TTL_MS/60000} phút ảnh hết hạn và bị dọn khỏi thư viện.</p></div></section>}
 <nav className="bottomNav"><button className={tab==="home"?"active":""} onClick={()=>setTab("home")}><span>⌂</span><small>Thư viện</small></button><button className={tab==="camera"?"active cameraNav":"cameraNav"} onClick={()=>setTab("camera")}><span>●</span><small>Camera</small></button><button className={tab==="settings"?"active":""} onClick={()=>setTab("settings")}><span>⚙</span><small>Cài đặt</small></button></nav>
 {boothOpen&&<BoothSettings value={booth} onChange={setBooth} onClose={()=>setBoothOpen(false)} onExport={()=>setBoothOpen(false)}/>} 
 {editorOpen&&pending.length>0&&<div className="photoEditorBackdrop"><div className="photoEditor"><div className="photoEditorHead"><div><span className="eyebrow">LH PTB STUDIO EDITOR</span><h2>Hoàn thiện ảnh</h2><p>Ảnh sẽ tự động căn, crop và đặt đúng từng vùng của Template PNG. Khi export, tỷ lệ canvas bám theo template.</p></div><button className="modalClose" onClick={()=>setEditorOpen(false)}>×</button></div>
 <div className="editorPreview" style={{background:customBg?`url(${customBg}) center/cover`:getBoothBackground(bg).css,transform:`scale(${editorZoom})`}}>{templatePng&&templateSlots.length?<div className="templateLivePreview" style={{aspectRatio:`${templateSize[0]} / ${templateSize[1]}`,width:"min(100%,650px)"}}><div className="templateLivePhotos">{pending.slice(0,templateSlots.length).map((s,i)=>{const sl=templateSlots[i];const activeSlot=selectedTemplateSlot===i;return <div key={s.id} className="templateSlotLayer" onPointerDown={e=>handleTemplatePointerDown(i,e as any)} onPointerMove={e=>handleTemplatePointerMove(e as any)} onPointerUp={handleTemplatePointerUp} onPointerCancel={handleTemplatePointerUp} onClick={()=>setSelectedTemplateSlot(i)} style={{left:`${sl.x*100}%`,top:`${sl.y*100}%`,width:`${sl.w*100}%`,height:`${sl.h*100}%`,overflow:"hidden",cursor:templateCalibrate?(dragTemplate.current?.index===i?"grabbing":"grab"):"default",outline:templateCalibrate&&activeSlot?"2px solid rgba(255,79,163,.95)":"none",outlineOffset:templateCalibrate&&activeSlot?"2px":"0",touchAction:"none"}}><img src={s.src} alt={`Ảnh ${i+1}`} draggable={false} style={{width:"100%",height:"100%",objectFit:"cover",display:"block",transformOrigin:"center center",transform:`translate(${(sl.ox??0)*100}%, ${(sl.oy??0)*100}%) scale(${sl.zoom??1})`,filter:`${FILTERS[filter]||"none"} brightness(${1+brightness/100+(shadows+highlights)/700}) contrast(${1+contrast/100+highlights/900-shadows/1100+sharpness/220}) saturate(${1+saturation/100}) sepia(${Math.max(0,temperature)/260}) hue-rotate(${temperature<0?Math.abs(temperature)*.35:0}deg)`}}/></div>})}</div><img className="editorTemplatePng" src={templatePng} alt="Template PNG"/></div>:<><div className={`editorPhotos multi layout-${layout}`}>{pending.slice(0,layout==="twoThree"?6:4).map((s,i)=><div className="editorPhotoItem" key={s.id}><img src={s.src} style={{filter:`${FILTERS[filter]||"none"} brightness(${1+brightness/100+(shadows+highlights)/700}) contrast(${1+contrast/100+highlights/900-shadows/1100+sharpness/220}) saturate(${1+saturation/100}) sepia(${Math.max(0,temperature)/260}) hue-rotate(${temperature<0?Math.abs(temperature)*.35:0}deg)`,borderRadius:radius}}/><button className="retakePhotoButton" onClick={()=>retakePending(i)} disabled={retake!==null}>↻ Chụp lại {i+1}</button><label className="replacePhotoButton">↑ Tải ảnh<input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)replacePendingPhoto(i,f);e.currentTarget.value=""}}/></label></div>)}</div><div className="editorBackgroundOverlay" style={{background:customBg?`url(${customBg}) center/cover`:getBoothBackground(bg).css}}/>{customFrame&&<img className="editorCustomFrame" src={customFrame} alt="Frame"/>}<div className="editorBackgroundEdge" />{sticker.map(s=><span key={s.id} className="editorFloatingSticker" style={{left:`${s.x*100}%`,top:`${s.y*100}%`,fontSize:s.size}}>{s.glyph}</span>)}{caption!=="Không"&&<div className={`editorCaption ${captionPos}`} style={{fontFamily:FONT_MAP[font],fontSize:captionSize,color:captionColor}}>{caption==="Chữ riêng"?customText:caption==="Cả hai"?`${customText} • ${new Date().toLocaleDateString("vi-VN")}`:new Date().toLocaleDateString("vi-VN")}</div>}</>}</div>
 <div className="editorSection"><div className="editorTitle"><b>Layout</b><span>{LAYOUTS.find(x=>x.id===layout)?.name}</span></div><div className="layoutChoices">{LAYOUTS.map(l=><button key={l.id} className={layout===l.id?"active":""} onClick={()=>setLayout(l.id)}>{l.name}</button>)}</div></div>
 <div className="editorSection"><div className="editorTitle"><b>Phông</b><span>{customBg?"Phông riêng":getBoothBackground(bg).name}</span></div><div className="editorBgs">{BOOTH_BACKGROUNDS.map(b=><button key={b.id} className={!customBg&&bg===b.id?"active":""} onClick={()=>{setBg(b.id);setCustomBg(null)}}><span style={{background:b.css}}/><small>{b.name}</small></button>)}</div><label className="customBgButton">＋ Tải phông riêng<input type="file" accept="image/*" hidden onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setCustomBg(String(r.result));r.readAsDataURL(f);e.currentTarget.value=""}}/></label></div>
 <div className="editorSection"><div className="editorTitle"><b>Khung</b><span>{frame}</span></div><div className="miniChoices">{["#fff","#101010","#ffd8e6","#f6ead5","#cce6ff","#d4f4e7"].map(c=><button key={c} className={frame===c?"active":""} style={{background:c}} onClick={()=>setFrame(c)}/>)}</div><div className="boothPatterns">{["Chấm bi","Caro","Kẻ sọc","Kim tuyến","Giấy kraft"].map(p=><button key={p} className={pattern===p?"active":""} onClick={()=>setPattern(pattern===p?"":p)}>{p}</button>)}</div></div>
 <div className="editorSection enhancementSection"><div className="editorTitle"><b>✨ Làm đẹp ảnh sau khi chụp</b><span>{enhancePreset}</span></div><div className="enhancePresets">{["Tự nhiên","Tự động đẹp","Trong trẻo","Chân dung","Film nhẹ","Ấm áp"].map(x=><button key={x} className={enhancePreset===x?"active":""} onClick={()=>applyEnhancePreset(x)}>{x}</button>)}</div><div className="enhanceQuick"><button className={softGlow?"active":""} onClick={()=>setSoftGlow(v=>!v)}>✦ Ánh sáng mềm</button><button className={lightLeak?"active":""} onClick={()=>setLightLeak(v=>!v)}>☀ Light Leak</button><button className={grain?"active":""} onClick={()=>setGrain(v=>!v)}>🎞 Hạt film</button><button className={vignette>0?"active":""} onClick={()=>setVignette(v=>v?0:12)}>◉ Viền sáng tối</button></div></div><div className="editorSection"><div className="editorTitle"><b>Điều chỉnh màu sắc</b><button onClick={()=>{setTemperature(0);setHighlights(0);setShadows(0)}}>Đặt lại tông màu</button></div><div className="editorControls"><label>Độ sáng <input type="range" min="-30" max="30" value={brightness} onChange={e=>setBrightness(+e.target.value)}/></label><label>Nhiệt độ màu · Lạnh ↔ Ấm <input type="range" min="-100" max="100" value={temperature} onChange={e=>setTemperature(+e.target.value)}/><small>{temperature===0?"Trung tính":temperature<0?`Lạnh ${Math.abs(temperature)}`:`Ấm ${temperature}`}</small></label><label>Vùng sáng <input type="range" min="-100" max="100" value={highlights} onChange={e=>setHighlights(+e.target.value)}/></label><label>Vùng tối <input type="range" min="-100" max="100" value={shadows} onChange={e=>setShadows(+e.target.value)}/></label><label>Tương phản <input type="range" min="-30" max="30" value={contrast} onChange={e=>setContrast(+e.target.value)}/></label><label>Bão hoà <input type="range" min="-30" max="30" value={saturation} onChange={e=>setSaturation(+e.target.value)}/></label><label>Độ nét <input type="range" min="0" max="20" value={sharpness} onChange={e=>setSharpness(+e.target.value)}/></label><label>Blur nền <input type="range" min="0" max="4" value={blurBg} onChange={e=>setBlurBg(+e.target.value)}/></label><label>Vignette <input type="range" min="0" max="60" value={vignette} onChange={e=>setVignette(+e.target.value)}/></label><label>Bo góc <input type="range" min="0" max="60" value={radius} onChange={e=>setRadius(+e.target.value)}/></label><label>Padding <input type="range" min="10" max="90" value={padding} onChange={e=>setPadding(+e.target.value)}/></label><label>Preview zoom <input type="range" min=".8" max="1.2" step=".05" value={editorZoom} onChange={e=>setEditorZoom(+e.target.value)}/></label></div></div>
 <div className="editorSection"><div className="editorTitle"><b>Hiệu ứng</b><span>Giống PhotoXinhh</span></div><div className="effectChoices">{[["timestamp","📅 TimeStamp",timestamp,setTimestamp],["lightLeak","☀️ Light Leak",lightLeak,setLightLeak],["vignette","🌑 Vignette",vignette>0,(v:boolean)=>setVignette(v?35:0)],["grain","🎞️ Grain",grain,setGrain],["chromatic","🌈 Chromatic",chromatic,setChromatic]].map(([id,label,on,setter]:any)=><button key={id} className={on?"active":""} onClick={()=>setter(!on)}>{label}</button>)}</div></div>
 <div className="editorSection templateImportSection"><div className="editorTitle"><b>Template Studio</b><span>{templateSlots.length?`${templateSlots.length} ô ảnh`:templateStatus}</span></div>
 <label className="customBgButton">＋ Tải Template PNG<input type="file" accept="image/png" hidden onChange={async e=>{const f=e.target.files?.[0];if(!f)return;try{const r=new FileReader();r.onload=async()=>{try{const src=String(r.result);const result=await detectTemplateSlots(src);const slots=result.slots.map(x=>({...x,zoom:1,ox:0,oy:0}));setTemplatePng(src);setTemplateSlots(slots);setTemplateSize([result.width,result.height]);setLayout("template");setSelectedTemplateSlot(0);setTemplateStatus(slots.length?`Đã nhận ${slots.length} vùng ảnh`:"Không tìm thấy vùng ảnh");notify(slots.length?`Đã nhận ${slots.length} vùng ảnh`:`Template chưa có vùng ảnh để tự nhận`)}catch{notify("Không đọc được Template PNG")}};r.readAsDataURL(f)}catch{notify("Không thể tải Template PNG")}e.currentTarget.value=""}}/></label>
 {templateSlots.length>0&&<div className="templateStudioPanel">
   <div className="templateStudioTop"><b>✓ Template đã khóa tỷ lệ</b><small>{templateSize[0]} × {templateSize[1]} px · không kéo méo artwork</small></div>
   <div className="templateStudioActions"><button className={templateCalibrate?"active":""} onClick={()=>setTemplateCalibrate(v=>!v)}>{templateCalibrate?"✓ Đang căn chỉnh":"⌘ Căn chỉnh Template"}</button><button onClick={resetAllTemplateSlots}>↺ Reset tất cả</button></div>
   <div className="templateSlotTabs">{templateSlots.map((_,i)=><button key={i} className={selectedTemplateSlot===i?"active":""} onClick={()=>setSelectedTemplateSlot(i)}>Ảnh {i+1}</button>)}</div>
   {templateSlots[selectedTemplateSlot]&&<div className="templateCalibrationControls">
     <div className="calibrationRow"><b>Ảnh {selectedTemplateSlot+1}</b><span>Kéo trực tiếp ảnh trong khung để căn</span></div>
     <label>Zoom <input type="range" min="0.7" max="2.5" step="0.01" value={templateSlots[selectedTemplateSlot].zoom??1} onChange={e=>updateTemplateSlot(selectedTemplateSlot,{zoom:+e.target.value})}/><output>{(templateSlots[selectedTemplateSlot].zoom??1).toFixed(2)}×</output></label>
     <label>Vị trí X <input type="range" min="-0.5" max="0.5" step="0.005" value={templateSlots[selectedTemplateSlot].ox??0} onChange={e=>updateTemplateSlot(selectedTemplateSlot,{ox:+e.target.value})}/><output>{Math.round((templateSlots[selectedTemplateSlot].ox??0)*100)}%</output></label>
     <label>Vị trí Y <input type="range" min="-0.5" max="0.5" step="0.005" value={templateSlots[selectedTemplateSlot].oy??0} onChange={e=>updateTemplateSlot(selectedTemplateSlot,{oy:+e.target.value})}/><output>{Math.round((templateSlots[selectedTemplateSlot].oy??0)*100)}%</output></label>
     <div className="nudgeGrid"><button onClick={()=>nudgeTemplateSlot(selectedTemplateSlot,0,-.005)}>↑</button><button onClick={()=>nudgeTemplateSlot(selectedTemplateSlot,-.005,0)}>←</button><button onClick={()=>resetTemplateSlot(selectedTemplateSlot)}>●</button><button onClick={()=>nudgeTemplateSlot(selectedTemplateSlot,.005,0)}>→</button><button onClick={()=>nudgeTemplateSlot(selectedTemplateSlot,0,.005)}>↓</button></div>
     <button className="resetSlotButton" onClick={()=>resetTemplateSlot(selectedTemplateSlot)}>↺ Reset ảnh {selectedTemplateSlot+1}</button>
   </div>}
   <div className="templatePresetBox"><b>Template Preset</b><div className="presetSaveRow"><input value={templatePresetName} maxLength={30} placeholder="Tên template, ví dụ Hello Kitty 4 ảnh" onChange={e=>setTemplatePresetName(e.target.value)}/><button onClick={saveTemplatePreset}>Lưu</button></div>{templatePresets.length>0&&<select defaultValue="" onChange={e=>{if(e.target.value)loadTemplatePreset(e.target.value)}}><option value="">Mở preset đã lưu</option>{templatePresets.map(n=><option key={n}>{n}</option>)}</select>}<small>Preset lưu vị trí, zoom và thứ tự các ô ảnh để dùng lại template mà không cần căn lại</small></div>
   <div className="templateStudioHint">Bật Căn chỉnh Template rồi kéo trực tiếp từng ảnh. Viền hồng cho biết ô đang được chọn. Mọi thay đổi được dùng đồng thời cho Preview và ảnh PNG xuất ra.</div>
   <button className="templateRemoveButton" onClick={()=>{setTemplatePng(null);setTemplateSlots([]);setTemplateSize([4,3]);setTemplateStatus("Chưa có template");setTemplateCalibrate(false);setSelectedTemplateSlot(0)}}>Xoá template</button>
 </div>}
 <p className="frameHelp">Template được giữ nguyên tỷ lệ gốc. Ảnh được crop kiểu Cover và có thể căn chỉnh riêng từng ô mà không làm biến dạng Template.</p></div>
<div className="editorSection"><div className="editorTitle"><b>Khung PNG riêng</b><span>{customFrame?"Đã tải":"Chưa có"}</span></div><label className="customBgButton">＋ Tải frame PNG trong suốt<input type="file" accept="image/png" hidden onChange={e=>{const f=e.target.files?.[0];if(!f)return;const r=new FileReader();r.onload=()=>setCustomFrame(String(r.result));r.readAsDataURL(f);e.currentTarget.value=""}}/></label><p className="frameHelp">Vùng trong suốt của PNG là nơi ảnh chụp xuất hiện; phần có màu sẽ nằm phía trên ảnh.</p></div>
 <div className="editorSection"><div className="editorTitle"><b>Chữ</b></div><div className="textChoices">{["Ngày","Chữ riêng","Cả hai","Không"].map(x=><button key={x} className={caption===x?"active":""} onClick={()=>setCaption(x)}>{x}</button>)}</div>{caption!=="Không"&&<div className="editorControls"><input value={customText} maxLength={60} placeholder="Nội dung" onChange={e=>setCustomText(e.target.value)}/><select value={font} onChange={e=>setFont(e.target.value)}>{Object.keys(FONT_MAP).map(x=><option key={x}>{x}</option>)}</select><label>Cỡ chữ <input type="range" min="18" max="72" value={captionSize} onChange={e=>setCaptionSize(+e.target.value)}/></label><label>Vị trí <select value={captionPos} onChange={e=>setCaptionPos(e.target.value as any)}><option value="top">Trên</option><option value="bottom">Dưới</option></select></label><label>Màu chữ <input type="color" value={captionColor} onChange={e=>setCaptionColor(e.target.value)}/></label></div>}</div>
 <div className="editorSection"><div className="editorTitle"><b>Sticker</b><span>{sticker.length}</span></div><div className="stickerChoices">{STICKERS.map(g=><button key={g} onClick={()=>addSticker(g)}><strong>{g}</strong></button>)}</div></div>
 <div className="saveNote">Ảnh cuối được ghép nền + ảnh + khung + chữ + sticker thành một file PNG chất lượng cao. Trên điện thoại, nút lưu sẽ mở tùy chọn lưu/chia sẻ để bạn chọn Lưu hình ảnh; trên máy tính sẽ tải file PNG xuống. Bản xem trước trong web vẫn được lưu 30 phút.</div><div className="photoEditorActions"><button className="boothSecondary" onClick={()=>createVideoRecap()}>Video Recap</button><button className="boothSecondary" onClick={()=>saveSeparate()}>Ảnh riêng</button><button className="boothApply" onClick={()=>saveComposite()}>Lưu PNG</button></div><div className="exportFormatRow"><span>Xuất định dạng khác</span><button onClick={()=>downloadRendered("jpg")}>JPG</button><button onClick={()=>downloadRendered("webp")}>WebP</button></div><button className="saveBothButton" onClick={()=>saveBoth()}>Lưu cả ảnh ghép + ảnh riêng</button></div></div>}
 {toast&&<div className="toast show">{toast}</div>}
 </main>
}
function dataURLToBlob(data:string){const [h,b]=data.split(",");const mime=h.match(/:(.*?);/)?.[1]||"image/png";const bin=atob(b);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return new Blob([u],{type:mime})}
