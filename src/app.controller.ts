import { Controller, Get, Req, Res,Param } from '@nestjs/common';
import { AppService } from './app.service';
import { Request, Response } from 'express';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

    @Get('artist-albums/:id')
    getArtistAlbums(@Param('id') id:string): Promise<any> {
      return this.appService.getTopTracks(id);
    }

  @Get('stream')
  async streamAudio(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!req.headers.range) {
      res.status(400).send('Requires Range header');
      return;
    }

    try {
      const audioStream = await this.appService.streamAudio(req.headers.range, req.query.url as string);
      res.writeHead(206, audioStream.head);
      audioStream.file.pipe(res);
    } catch (error) {
      console.error(error)
      res.status(500).send({ message: error.message });
    }
  }

  @Get('search/:query')
  async search(@Param('query') query:string): Promise<any> {
    return this.appService.getSongsByQuery(query);
  }

  @Get('search/artist/:id')
  async searchArtist(@Param('id') id:string): Promise<any> {
    return this.appService.getArtist(id);
  }
}
