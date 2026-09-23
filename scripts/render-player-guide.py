#!/usr/bin/env python3
"""Render the player production guide PDF shown on the wiki.

Usage (game repo root; needs `pip install reportlab` and the DejaVu fonts):
    GUIDE_SOURCE="main <sha>" python3 scripts/render-player-guide.py <out.pdf>

The wiki copy lives at space/attachments/systems/production-guide.pdf and is embedded on
wiki: Systems/Cellar & Processing. The prose and tables below are hand-maintained. They
were last checked against main df509125 content (recipes, processes, upgrades, skill
trees, items). Re-check them whenever a content release touches those files; see wiki:
Operations/Wiki Publishing Jobs (job 3).
"""
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Preformatted, Flowable
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_CENTER
from pathlib import Path
import os,sys
out=Path(sys.argv[1] if len(sys.argv)>1 else 'production-guide.pdf')
SOURCE=os.environ.get('GUIDE_SOURCE','origin/main')
for name,file in [('Guide','DejaVuSans.ttf'),('GuideBold','DejaVuSans-Bold.ttf'),('GuideMono','DejaVuSansMono.ttf')]:
 pdfmetrics.registerFont(TTFont(name,'/usr/share/fonts/truetype/dejavu/'+file))
pdfmetrics.registerFontFamily('Guide',normal='Guide',bold='GuideBold',italic='Guide',boldItalic='GuideBold')
green=colors.HexColor('#244D3A'); pale=colors.HexColor('#EDF3ED'); ink=colors.HexColor('#26352E')
styles=getSampleStyleSheet()
styles.add(ParagraphStyle(name='BodyG',fontName='Guide',fontSize=10,leading=15,textColor=ink,spaceAfter=9))
styles.add(ParagraphStyle(name='TitleG',fontName='GuideBold',fontSize=25,leading=30,textColor=green,spaceAfter=12))
styles.add(ParagraphStyle(name='HeadG',fontName='GuideBold',fontSize=16,leading=21,textColor=green,spaceAfter=10))
styles.add(ParagraphStyle(name='SubG',fontName='GuideBold',fontSize=11,leading=16,textColor=green,spaceBefore=9,spaceAfter=6))
styles.add(ParagraphStyle(name='CellG',fontName='Guide',fontSize=8.5,leading=12,textColor=ink))
styles.add(ParagraphStyle(name='SmallG',fontName='Guide',fontSize=8,leading=12,textColor=ink,spaceAfter=7))
styles.add(ParagraphStyle(name='MonoG',fontName='GuideMono',fontSize=10,leading=15,spaceAfter=10))
story=[]
def p(t,style='BodyG'):story.append(Paragraph(t,styles[style]))
def h(t):p(t,'HeadG')
def sub(t):p(t,'SubG')
def table(rows,widths):
 header=ParagraphStyle('th',parent=styles['CellG'],fontName='GuideBold',textColor=colors.white)
 data=[[Paragraph(str(c),header if i == 0 else styles['CellG']) for c in row] for i,row in enumerate(rows)]
 t=Table(data,colWidths=widths,repeatRows=1,hAlign='LEFT')
 t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),green),('ROWBACKGROUNDS',(0,1),(-1,-1),[pale,colors.white]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7),('LINEBELOW',(0,0),(-1,0),1,green)]))
 for c in data[0]:c.style=ParagraphStyle('th',parent=styles['CellG'],fontName='GuideBold',textColor=colors.white)
 story.extend([t,Spacer(1,10)])
def page():story.append(PageBreak())
class Chart(Flowable):
 def __init__(self):Flowable.__init__(self);self.width=499;self.height=245
 def draw(self):
  c=self.canv
  def box(x,y,w,text):
   c.setFillColor(pale);c.setStrokeColor(green);c.roundRect(x,y,w,40,7,fill=1,stroke=1)
   c.setFillColor(ink);c.setFont('GuideBold',8)
   lines=text.split('|')
   for i,line in enumerate(lines):c.drawCentredString(x+w/2,y+25-i*12,line)
  def arrow(x,y,xx,yy):
   c.setStrokeColor(green);c.setFillColor(green);c.setLineWidth(1.2);c.line(x,y,xx,yy)
   import math
   a=math.atan2(yy-y,xx-x);s=5
   path=c.beginPath();path.moveTo(xx,yy);path.lineTo(xx-s*math.cos(a-.5),yy-s*math.sin(a-.5));path.lineTo(xx-s*math.cos(a+.5),yy-s*math.sin(a+.5));path.close();c.drawPath(path,fill=1,stroke=0)
  box(0,200,218,'CROP SEEDS|Hoe → plant → water → harvest')
  box(281,200,218,'FRUIT TREES|Plant tree seeds → grow → pick')
  box(0,130,218,'PRESERVING BARREL|4–24 matching crops → seal')
  box(281,130,218,'FRUIT PRESS|Fruit → Fresh Must + Pomace')
  box(0,60,218,'PRESERVED CROPS|Sell, eat or deliver')
  box(281,60,218,'FERMENTATION CASK|3 Fresh Must → 1 Bottle')
  arrow(109,200,109,170);arrow(390,200,390,170);arrow(109,130,109,100);arrow(390,130,390,100)
  arrow(218,220,281,150);c.setFont('Guide',7);c.drawString(230,190,'Grapes')
  arrow(390,60,390,27);c.setFillColor(green);c.setFont('GuideBold',9);c.drawCentredString(390,12,'SELL BOTTLES')
p('Orchard &amp; Cellar','TitleG');p('A player’s guide to growing, preserving and fermentation','HeadG')
p('Recipes, production flow and estate progression • generated from content on '+SOURCE+' • 23 September 2026 (first edition 17 September 2026)','SmallG')
p('There are <b>two production paths</b>: preserve harvested crops in a Preserving Barrel, or press selected fruit into Fresh Must and ferment it into Bottles.')
story.append(Chart());story.append(Spacer(1,10))
sub('Start with seeds')
p('Buy ordinary crop seeds from the farming merchant. Hoe the ground, plant, then water. Growth pauses when the soil dries out. Normal watering lasts <b>one game day (15 real minutes)</b>. Winter normally pauses crop growth unless you have seasonal protection.')
p('<b>Grapes can follow either production path.</b> Without bonuses, one grape planting produces 3 Grapes after 30 minutes of watered growing time.')
sub('Establish an orchard')
p('Mature apple, pear, peach and cherry trees offer <b>renewable fruit picking</b> with E or touch: 2 fruit each game day (15 real minutes). Picking keeps the tree, which shows as fruitless until its fruit ripens again. Felling a ripe tree also drops its fruit along with the wood.')
p('Each fruit payout has a <b>5% base chance</b> to drop a matching tree seed. Plant it on clear grass or tilled soil to grow that tree.')
p('This guide covers the implemented system checked on the date above. Future machine tiers in older design notes are listed separately at the end.','SmallG')
page();h('Build your production equipment')
p('The production recipes are hinted in <b>Jane’s Gardening Book</b>; basic crafting (Planks, Workbench, Furnace) in <b>Marlow’s book</b>. Turn <b>1 Wood into 4 Planks</b>. Make a Workbench from 4 Planks arranged in a square. Stand near the Workbench to craft the machines below.')
p('For metal supplies, craft a Furnace from <b>8 Stone around an empty centre</b>, near a Workbench. Smelt the relevant ore using Wood or Planks as fuel.')
table([['Equipment','Materials','Crafting station'],['Preserving Barrel','6 Planks + 2 Iron Bars','Workbench'],['Fruit Press','6 Planks + 1 Iron Bar','Workbench'],['Fermentation Cask','1 Preserving Barrel + 1 Copper Bar','Workbench']],[135,244,120])
sub('Use these crafting patterns')
p('P = Plank · I = Iron Bar · dot = empty slot','SmallG')
story.append(Preformatted('Preserving Barrel       Fruit Press\nI  P  I                 P  I  P\nP  .  P                 P  .  P\nP  P  P                 P  .  P\n\nFermentation Cask\nCopper Bar\nPreserving Barrel',styles['MonoG']))
p('The cask recipe <b>consumes the barrel</b>. Make another barrel if you want preserving and fermentation running together. These are shaped recipes: ingredient placement matters.')
sub('Preserve a batch of crops')
p('1. Place a Preserving Barrel and open it.<br/>2. Load <b>4–24 raw crops of the same kind</b>.<br/>3. Select <b>Seal</b>.<br/>4. Wait <b>30 real minutes</b> at the base upgrade level.<br/>5. Collect the preserved crops.')
p('The whole batch cures together: <b>10 raw crops become 10 preserved crops</b>. Preserved crops generally sell for about 1.5× their raw value, with rounding.')
p('Supported inputs include vegetables, wheat, grapes and strawberries. <b>Apples, pears, peaches, cherries and Must are not Preserving Barrel inputs.</b>')
p('Preserved crops are also <b>food</b>: eat one to restore 12–23 Hunger on outdoor work and expeditions (a full Hunger bar leaves it untouched). Village Orders accept preserved produce, and delivering the right mix teaches the Pantry Lunch and Cellar Supper recipes.')
page();h('Press fruit and ferment Bottles')
table([['Stage','Input','Output','Base time'],['Fruit Press','1 Apple, Pear, Peach, Cherry or Grape','1 Fresh Must + 1 Pomace','5 minutes'],['Fermentation Cask','3 Fresh Must','1 Estate Bottle','30 minutes']],[100,155,155,89])
p('Both machines <b>start automatically</b> when they have sufficient input and output space. They need neither fuel nor a separate empty bottle.')
p('Move Fresh Must from the press into the cask yourself. Empty <b>both press outputs</b>—Must and Pomace—to avoid blocking production.')
sub('A worked example')
p('<b>3 Grapes → 3 Must + 3 Pomace → 1 Bottle.</b><br/>With one press, this takes 15 minutes of pressing followed by 30 minutes of base fermentation.')
p('All five eligible fruits currently produce the same Fresh Must and Bottle item. Pomace is not waste: turn it into Compost (below) or sell it.')
sub('Turn Pomace into Compost')
p('Handcraft <b>4 Pomace + 1 Fiber into 1 Compost</b> (no station needed). Use Compost on a growing crop (F or the primary pointer action) to advance its growth by <b>25%</b>, once per planting.')
sub('The four Estate Vintage tiers')
p('Buy Estate Vintage ranks to trade longer fermentation times for more valuable Bottles. These are estate upgrade ranks, not separate machines.')
table([['Tier','Rank','Rank purchase','Fermentation','Bottle value*'],['Estate','None','—','30 minutes','50 Silver'],['Select','1','6 Gold','45 minutes','1 Gold'],['Reserve','2','18 Gold','60 minutes','2 Gold'],['Grand Vintage','3','54 Gold','90 minutes','4 Gold']],[110,45,110,120,114])
p('*Times exclude the Barreling skill; values exclude other applicable sale bonuses. The sale premium uses the seller’s estate rank. These are not separate Bottle items that you repeatedly reprocess.','SmallG')
sub('Avoid the common mix-up')
p('<b>Preserving Barrel:</b> matching raw crops; seal a batch.<br/><b>Fruit Press:</b> eligible fruit; automatically makes Must and Pomace.<br/><b>Fermentation Cask:</b> at least 3 Must; automatically makes Bottles.')
page();h('Buy upgrades for your estate')
p('On your own estate, open Build using <b>B</b> or the <b>hammer above the spanner</b>. Upgrade buttons appear below the catalogue. The estate owner buys them; their effects apply across the garden, residence and cellar.')
p('Each price below is the cost of buying that particular rank, not the cumulative total.')
table([['Upgrade','Rank 1','Rank 2','Rank 3','Benefit'],['Rich Soil','2 Gold','6 Gold','18 Gold','+10% / +20% / +30% crop growth rate'],['Selective Seeds','3 Gold','9 Gold','27 Gold','+10% / +20% / +30% average crop yield'],['Barrel Cellar','4 Gold','12 Gold','36 Gold','Larger preserving batches; faster curing'],['Estate Vintage','6 Gold','18 Gold','54 Gold','More valuable Bottles; longer fermentation']],[115,62,62,62,198])
sub('Barrel Cellar progression')
table([['Rank','Maximum batch','Curing time without Barreling'],['None','24 crops','30 minutes'],['1','32 crops','About 27m 16s'],['2','40 crops','25 minutes'],['3','48 crops','About 23m 5s']],[65,150,284])
p('The minimum stays at <b>4 matching crops</b>. Barrel Cellar affects preserving. Estate Vintage controls fermentation tiers.')
sub('Automate watering and protect growing crops')
p('<b>Sprinklers:</b> unlock Sprinkler Engineering at Farming level 10, then buy sprinklers for <b>5 Gold</b> each. They automatically water nearby crops.')
p('<b>Greenhouse:</b> unlock Greenhouse Charter at Farming level 10, then craft it near a Workbench from <b>20 Planks, 8 Iron Bars and 12 Stone</b>.')
p('<b>Barreling:</b> this Farming skill makes preserving and fermentation run 20% faster. A base 30-minute process takes <b>25 minutes</b>. It stacks with estate upgrades, but does not speed up the Fruit Press.')
page();h('Progress through Farming skills')
table([['Skill','Unlock requirement','Benefit'],['Green Thumb','Starting Farming branch','+3% crop yield per rank; 5 ranks'],['Farmcraft','Starting Farming branch','Lower hoeing and watering Vigour costs'],['Tender Hand','Farmcraft','Watering lasts 25% longer per rank; 3 ranks'],['Seed Saver','Farming 3 + Green Thumb','10% seed-return chance per rank; 3 ranks'],['Orchard Seed Saver','Farming 3 + Green Thumb','Tree-seed chances: 15%, 25%, then 35%'],['Bountiful Harvest','Farming 4 + Green Thumb','10% extra-bundle chance per rank; 3 ranks'],['Soil Whisperer','Farming 4 + Tender Hand','Detailed growth and moisture inspection'],['Barreling','Farming 5 + Farmcraft','Preserving and fermentation run 20% faster'],['Sprinkler Engineering','Farming 10 + Bountiful Harvest','Unlock sprinkler purchases'],['Greenhouse Charter','Farming 10 + Barreling','Unlock greenhouse crafting'],['Master Grower','Farming 10 + Seed Saver + Soil Whisperer','Crops grow through winter'],['Harvest Festival','Farming 15 + Sprinkler Engineering + Greenhouse Charter + Master Grower','Double the first successful crop harvest each game day']],[126,180,193])
sub('A practical route through the system')
p('Plant grapes → build a Preserving Barrel for batch income → build a Fruit Press and Fermentation Cask → unlock Barreling → improve crop supply and buy Estate Vintage ranks. Add presses or casks when one stage cannot keep up.')
sub('What is not a craftable tier yet?')
p('The current production machines are the <b>Preserving Barrel, Fruit Press and Fermentation Cask</b>. Screw Presses, Hydraulic Presses, Foudres and Cellar Cathedrals appear in future design notes; they are not additional tiers players can craft today.')
def footer(c,doc):
 c.setStrokeColor(green);c.setLineWidth(.5);c.line(48,40,547,40);c.setFont('Guide',8);c.setFillColor(green);c.drawString(48,27,'ORCHARD & CELLAR • PLAYER PRODUCTION GUIDE');c.drawRightString(547,27,str(doc.page))
doc=SimpleDocTemplate(str(out),pagesize=(595.28,841.89),rightMargin=48,leftMargin=48,topMargin=44,bottomMargin=54,title='Orchard & Cellar — Player Production Guide',author='Orchard & Cellar')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(out)
