import { expect, it, vi } from 'vitest';
import { drawTileRaster } from './tile-raster.js';
it('projects tile rasters with the viewport camera and skips empty ranges', () => {
  const drawImage=vi.fn(),context={drawImage} as unknown as CanvasRenderingContext2D;
  const image={} as CanvasImageSource,viewport={x:100,y:40,width:640,height:480},camera={x:-16,y:32,zoom:2};
  drawTileRaster(context,image,{minimumX:2,minimumY:3,maximumX:5,maximumY:7},viewport,camera);
  expect(drawImage).toHaveBeenCalledExactlyOnceWith(image,2,3,3,4,196,72,96,128);
  drawTileRaster(context,image,{minimumX:2,minimumY:3,maximumX:2,maximumY:7},viewport,camera);
  expect(drawImage).toHaveBeenCalledOnce();
});
