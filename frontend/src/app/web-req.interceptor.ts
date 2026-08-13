import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { catchError, tap, switchMap, finalize, shareReplay } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class WebReqInterceptor implements HttpInterceptor {

  constructor(private authService: AuthService) { }

  private refreshRequest?: Observable<any>;


  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<any> {
    // Handle the request
    request = this.addAuthHeader(request);

    // call next() and handle the response
    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        console.log(error);

        if (error.status === 401) {
          if (request.url.includes('/users/me/access-token')) {
            this.authService.lock();
            return throwError(error);
          }
          // 401 error so we are unauthorized

          // refresh the access token
          return this.refreshAccessToken()
            .pipe(
              switchMap(() => {
                request = this.addAuthHeader(request);
                return next.handle(request);
              }),
              catchError((err: any) => {
                console.log(err);
                this.authService.lock();
                return throwError(err);
              })
            )
        }

        return throwError(error);
      })
    )
  }

  refreshAccessToken() {
    if (!this.refreshRequest) {
      this.refreshRequest = this.authService.getNewAccessToken().pipe(
        tap(() => {
          console.log("Access Token Refreshed!");
        }),
        finalize(() => {
          this.refreshRequest = undefined;
        }),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    }
    return this.refreshRequest;
  }


  addAuthHeader(request: HttpRequest<any>) {
    // get the access token
    const token = this.authService.getAccessToken();
    const csrfToken = this.getCookie('XSRF-TOKEN');

    if (token) {
      // append the access token to the request header
      return request.clone({
        setHeaders: {
          'x-access-token': token,
          ...(csrfToken ? { 'X-XSRF-TOKEN': csrfToken } : {})
        }
      })
    }
    if (csrfToken) {
      return request.clone({
        setHeaders: {
          'X-XSRF-TOKEN': csrfToken
        }
      })
    }
    return request;
  }

  private getCookie(name: string) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) {
      return parts.pop()?.split(';').shift() || null;
    }
    return null;
  }

}
