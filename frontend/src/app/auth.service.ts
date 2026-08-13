import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { WebRequestService } from './web-request.service';
import { Router } from '@angular/router';
import { concatMap, map, shareReplay, tap } from 'rxjs/operators';
import { OfflineDbService } from './offline/offline-db.service';
import { from } from 'rxjs';


@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private accessToken: string | null = null;

  constructor(
    private webService: WebRequestService,
    private router: Router,
    private http: HttpClient,
    private offlineDb: OfflineDbService
  ) { }

  login(email: string, password: string) {
    return this.webService.login(email, password).pipe(
      concatMap((res: HttpResponse<any>) => from(this.activateAuthenticatedUser(res)).pipe(map(() => res))),
      shareReplay()
    )
  }


  signup(email: string, password: string) {
    return this.webService.signup(email, password).pipe(
      concatMap((res: HttpResponse<any>) => from(this.activateAuthenticatedUser(res)).pipe(map(() => res))),
      shareReplay()
    )
  }



  async logout(): Promise<void> {
    this.accessToken = null;
    await this.offlineDb.clearAll();
    await this.router.navigate(['/login']);
  }

  lock(): void {
    this.accessToken = null;
    this.router.navigate(['/login']);
  }

  logoutRequest() {
    return this.http.post(`${this.webService.ROOT_URL}/users/logout`, {}, {
      withCredentials: true
    }).pipe(concatMap(() => from(this.logout())));
  }

  getAccessToken() {
    return this.accessToken;
  }

  setAccessToken(accessToken: string) {
    this.accessToken = accessToken;
  }

  getNewAccessToken() {
    return this.http.post(`${this.webService.ROOT_URL}/users/me/access-token`, {}, {
      observe: 'response',
      withCredentials: true
    }).pipe(
      tap((res: HttpResponse<any>) => {
        this.setAccessToken(res.headers.get('x-access-token'));
      })
    )
  }

  private async activateAuthenticatedUser(res: HttpResponse<any>): Promise<void> {
    const userId = res.body?._id;
    if (!userId) {
      throw new Error('Authentication response did not include a user id');
    }
    await this.offlineDb.activateUser(userId);
    this.setAccessToken(res.headers.get('x-access-token'));
  }
}
