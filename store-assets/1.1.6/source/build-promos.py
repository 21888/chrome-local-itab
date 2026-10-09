#!/usr/bin/env python3
"""Original, code-native brand artwork. It is deliberately not an app screenshot."""
from pathlib import Path
import subprocess
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
FOREST='#173f37'; IVORY='#f4f4e9'; LIME='#d7edac'; INK='#24463d'; MUTED='#ced9cc'
def rect(x,y,w,h,fill,rx=0,stroke=None,sw=1):
 return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'
def line(x1,y1,x2,y2,color,w=2):return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>'
def circle(x,y,r,fill,stroke=None,sw=1):return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>'
def group(s,tx=0,ty=0,scale=1):return f'<g transform="translate({tx} {ty}) scale({scale})">{s}</g>'
def gridmark(size,color):
 return ''.join(rect(i*size/3,j*size/3,size*.22,size*.22,color,size*.035) for i in range(3) for j in range(3))
def glyph(n,color):
 if n==0:return '<path d="M-8 -6L-14 0L-8 6M8 -6L14 0L8 6M3 -10L-3 10" fill="none" stroke="'+color+'" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'
 if n==1:return '<path d="M-10 -11H5L11 -5V11H-10ZM4 -11V-4H11M-5 2H6M-5 7H3" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round"/>'
 if n==2:return '<path d="M-11 -8H0L3 -4H12V10H-11Z" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round"/>'
 if n==3:return '<path d="M-10 -10H10V10H-10ZM-5 5L-1 0L3 3L7 -3M-4 -5h.1" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round"/>'
 if n==4:return '<path d="M-11 -9Q-4 -12 0 -8Q4 -12 11 -9V10Q4 7 0 11Q-4 7 -11 10ZM0 -8V11" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round"/>'
 return '<path d="M0 -13L4 -4L13 0L4 4L0 13L-4 4L-13 0L-4 -4Z" fill="none" stroke="'+color+'" stroke-width="2" stroke-linejoin="round"/>'
def dashboard():
 s=rect(0,5,256,162,'#0b2922',17)+rect(0,0,256,162,IVORY,17)
 s+=rect(16,14,224,22,'#e2e9dc',8)+circle(28,24,4,'none','#648072',1.5)+line(31,27,34,30,'#648072',1.5)+rect(43,22,81,4,'#91a797',2)
 colors=['#d5e7c8','#dfd7c8','#e5c8ad','#c8d9d9','#dcd7e8','#d9e7d8']
 for n,col in enumerate(colors):
  x=16+(n%3)*78; y=49+(n//3)*53
  s+=rect(x,y,68,43,col,10)+group(glyph(n,INK),x+34,y+21.5,.65)
 # A small direct-manipulation pointer is brand illustration, not composited into any screenshot.
 s+='<path d="M217 130L220 151L226 145L232 150L237 145L231 140L239 136Z" fill="#24463d" stroke="#f4f4e9" stroke-width="1.6" stroke-linejoin="round"/>'
 return s

def focus():
 s=rect(0,5,114,130,'#0b2922',15)+rect(0,0,114,130,'#294f44',15,'#567261')
 s+=circle(57,49,28,'none','#557666',5)
 s+='<path d="M57 21A28 28 0 1 1 33 63" stroke="#d7edac" stroke-width="5" fill="none" stroke-linecap="round"/>'
 s+=line(57,49,57,33,LIME,2.8)+line(57,49,70,54,LIME,2.8)+circle(57,49,3,LIME)
 s+=rect(20,96,74,14,'#466555',7)+circle(36,103,2.5,LIME)+line(45,103,77,103,'#b8d19e',2)
 return s

def notes():
 s=rect(0,4,113,65,'#0b2922',13)+rect(0,0,113,65,LIME,13)
 for j,w in enumerate([60,49,57]):
  y=17+j*15
  s+='<path d="M14 '+str(y)+'l3 3l5 -6" stroke="'+INK+'" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
  s+=rect(31,y-2,w,3,'#68845b',1.5)
 return s

def wordmark(x,y,size):return f'<text x="{x}" y="{y}" font-family="Liberation Sans, Arial, sans-serif" font-size="{size}" font-weight="700" letter-spacing="{-size*.045}" fill="{IVORY}">local iTab</text>'
def wrap(w,h,body,title):return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" role="img"><title>{title}</title><desc>Original abstract brand artwork representing saved-site organization and local productivity tools. Not an application screenshot.</desc>{body}</svg>'

small=rect(0,0,440,280,FOREST)
small+=circle(430,2,128,'#204a3d')
small+=rect(26,26,38,38,LIME,10)+group(gridmark(19,FOREST),36,36)
small+=wordmark(77,56,32)
small+=group(notes(),301,26,.96)
small+=group(dashboard(),26,93,1.02)
small+=group(focus(),297,118,1)
small+=circle(282,84,3,'#b8d19e')+circle(274,74,1.5,'#7c9b79')

marquee=rect(0,0,1400,560,FOREST)
marquee+=circle(1394,0,451,'#204a3d')
marquee+=circle(590,576,225,'none','#426350',1)
marquee+=rect(78,165,72,72,LIME,18)+group(gridmark(36,FOREST),97,184)
marquee+=wordmark(176,220,76)
# A quiet, geometric echo of ordered tiles below the wordmark.
marquee+=rect(80,276,128,5,'#a7c590',2.5)+rect(222,276,58,5,'#6e906f',2.5)+rect(294,276,26,5,'#466f57',2.5)
marquee+=group(dashboard(),594,127,1.80)
marquee+=group(notes(),1110,89,1.92)
marquee+=group(focus(),1120,263,1.80)
marquee+=circle(1082,232,7,LIME)+circle(1064,206,3,'#92b17e')

for name,w,h,body in [('small-promo-440x280',440,280,small),('marquee-promo-1400x560',1400,560,marquee)]:
 svg=ROOT/'source'/f'{name}.svg'; svg.write_text(wrap(w,h,body,'local iTab'))
 png=ROOT/'promo'/f'{name}.png'
 subprocess.run(['inkscape',str(svg),'--export-type=png','--export-filename='+str(png),'--export-width='+str(w*3),'--export-height='+str(h*3)],check=True,capture_output=True)
 with Image.open(png) as im:
  im.convert('RGB').resize((w,h),Image.Resampling.LANCZOS).save(png,optimize=True)
print('Rendered two original opaque RGB promotional illustrations from SVG at 3× then Lanczos-downsampled.')
