import { Injectable } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { WebRequestService } from './web-request.service';
import { Router } from '@angular/router';
import { shareReplay, tap } from 'rxjs/operators';


@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private accessToken: string | null = null;

  constructor(private webService: WebRequestService, private router: Router, private http: HttpClient) { }

  login(email: string, password: string) {
    return this.webService.login(email, password).pipe(
      shareReplay(),
      tap((res: HttpResponse<any>) => {
        // the auth tokens will be in the header of this response
        this.setAccessToken(res.headers.get('x-access-token'));
        console.log("LOGGED IN!");
      })
    )
  }


  signup(email: string, password: string) {
    return this.webService.signup(email, password).pipe(
      shareReplay(),
      tap((res: HttpResponse<any>) => {
        // the auth tokens will be in the header of this response
        this.setAccessToken(res.headers.get('x-access-token'));
        console.log("Successfully signed up and now logged in!");
      })
    )
  }



  logout() {
    this.accessToken = null;
    this.router.navigate(['/login']);
  }

  logoutRequest() {
    return this.http.post(`${this.webService.ROOT_URL}/users/logout`, {}, {
      withCredentials: true
    }).pipe(
      tap(() => {
        this.logout();
      })
    );
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
}
