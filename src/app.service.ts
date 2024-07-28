import { Injectable } from '@nestjs/common';
import SpotifyWebApi from 'spotify-web-api-node';
import { Readable } from 'stream';
import ytdl, { youtubeDl } from 'youtube-dl-exec';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { readFile, existsSync, writeFile } from 'fs-extra';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class AppService {
  private spotifyAPI: SpotifyWebApi;
  private cacheDir: string;

  constructor(private configService: ConfigService) {
    this.spotifyAPI = new SpotifyWebApi({
      clientId: this.configService.get('SPOTIFY_CLIENT_ID'),
      clientSecret: this.configService.get('SPOTIFY_CLIENT_SECRET'),
    });
    this.setAccessToken();

    this.cacheDir = path.join(os.tmpdir(), 'spotifydl-cache');
    if (!existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir);
    }
  }

  private async setAccessToken() {
    try {
      const data = await this.spotifyAPI.clientCredentialsGrant();
      this.spotifyAPI.setAccessToken(data.body['access_token']);
      console.log('Access token retrieved and set');
      setTimeout(() => this.setAccessToken(), (data.body['expires_in'] - 60) * 1000);
    } catch (error) {
      console.error('Failed to retrieve an access token', error);
    }
  }

  getHello(): string {
    return 'Hello World!';
  }

  async streamAudio(range: string, url: string) {
    const cachedTrack = await this.getCachedTrack(url);
    let song: Buffer;
    if (!cachedTrack) {
      song = await this.downloadTrack(url);
      await this.cacheTrack(url, song);
    } else {
      song = cachedTrack;
    }
    
    const fileSize = song.length;
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
    const bufferStream = new Readable();
    bufferStream._read = () => {}; // No-op
    bufferStream.push(song.slice(start, end + 1));
    bufferStream.push(null);
    return {
      file: bufferStream,
      head: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      },
    };
  }

  async downloadTrack(url: string): Promise<Buffer> {
    try {
      const videoUrl = await this.searchYt(url);
      const filename = `${videoUrl}.mp3`;
      const filepath = path.join(this.cacheDir, filename);
      (await youtubeDl.exec(videoUrl, {
        extractAudio: true,
        audioFormat: 'mp3',
        output: filepath,
        
      }));
      return await readFile(filepath);
    } catch (error) {
      throw new Error(`Error downloading track: ${error.message}`);
    }
  }

  async cacheTrack(url: string, song: Buffer): Promise<void> {
    const videoUrl = await this.searchYt(url);
    const filename = `${videoUrl}.mp3`;
    const filepath = path.join(this.cacheDir, filename);
    await writeFile(filepath, song);
  }

  async getCachedTrack(url: string): Promise<Buffer | null> {
    const videoUrl = await this.searchYt(url);
    const filename = `${videoUrl}.mp3`;
    const filepath = path.join(this.cacheDir, filename);
    if (existsSync(filepath)) {
      return await readFile(filepath);
    }
    return null;
  }

  async searchYt(url: string) {
    const info = await this.spotifyAPI.getTrack(url);
    const search = await ytdl(`ytsearch:${info.body.name} ${info.body.artists[0].name}`, {
      dumpSingleJson: true,
      noCheckCertificates: true,
      noWarnings: true,
      preferFreeFormats: true,
      encoding: 'utf8',
    }) as unknown as any;
    return `${search.entries[0].id}`;
  }

  async getTopTracks(artistId: string) {
    try {
      const artist = await this.spotifyAPI.getArtist(artistId);
      const topTracks = await this.spotifyAPI.getArtistTopTracks(artistId, 'US');
      return topTracks.body.tracks.map((tracks)=>{
        return {
          name:tracks.name,
          songId:tracks.id,
          image:tracks.album.images[0].url,
          author:artist.body.name,
          duration:tracks.duration_ms
        }
      });
    } catch (error) {
      console.error('Error fetching top tracks:', error);
      throw new Error(`Error fetching top tracks: ${error.message}`);
    }
  }

  async getArtistAlbums(artistId: string) {
    try {
      const artist = await this.spotifyAPI.getArtist(artistId);
      console.log(artist.body);
      const albums = await this.spotifyAPI.getArtistAlbums(artistId);
      console.log(albums.body);
      return albums.body.items;
    } catch (error) {
      console.error('Error fetching artist albums:', error);
      throw new Error(`Error fetching artist albums: ${error.message}`);
    }
  }

  
  async getSongsByQuery(query: string) {
    const songs = await this.spotifyAPI.search(query,['track'],{limit:5});
    return songs.body.tracks.items.map((albums)=>{
      return {
        name:albums.name,
        songId:albums.id,
        image:albums.album.images[0].url,
        author:albums.artists[0].name
      }
    });
  }
  async getArtist(artistId: string) {
    const artist = await this.spotifyAPI.getArtist(artistId);
    return artist.body;
  }
}
