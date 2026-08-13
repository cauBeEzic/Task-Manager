import { HttpErrorResponse, HttpRequest, HttpResponse } from '@angular/common/http';
import { firstValueFrom, of, Subject, throwError } from 'rxjs';
import { WebReqInterceptor } from './web-req.interceptor';

describe('WebReqInterceptor refresh handling', () => {
  let auth: any;
  let interceptor: WebReqInterceptor;

  beforeEach(() => {
    auth = {
      getAccessToken: jasmine.createSpy('getAccessToken').and.returnValue(null),
      getNewAccessToken: jasmine.createSpy('getNewAccessToken'),
      lock: jasmine.createSpy('lock')
    };
    interceptor = new WebReqInterceptor(auth);
  });

  it('preserves offline data by locking rather than explicitly logging out when refresh fails', async () => {
    auth.getNewAccessToken.and.returnValue(throwError(() => new HttpErrorResponse({ status: 503 })));
    const handler = { handle: () => throwError(() => new HttpErrorResponse({ status: 401 })) };

    await expectAsync(firstValueFrom(interceptor.intercept(new HttpRequest('GET', '/lists'), handler as any))).toBeRejected();

    expect(auth.lock).toHaveBeenCalledTimes(1);
  });

  it('shares one refresh request between concurrent unauthorized requests', async () => {
    const refresh = new Subject<HttpResponse<any>>();
    auth.getNewAccessToken.and.returnValue(refresh);
    const attempts = new Map<string, number>();
    const handler = { handle: jasmine.createSpy('handle').and.callFake((request: HttpRequest<any>) => {
      const attempt = (attempts.get(request.url) || 0) + 1;
      attempts.set(request.url, attempt);
      return attempt === 1
        ? throwError(() => new HttpErrorResponse({ status: 401 }))
        : of(new HttpResponse({ status: 200 }));
    }) };

    const first = firstValueFrom(interceptor.intercept(new HttpRequest('GET', '/one'), handler as any));
    const second = firstValueFrom(interceptor.intercept(new HttpRequest('GET', '/two'), handler as any));
    refresh.next(new HttpResponse({ status: 200 }));
    refresh.complete();

    await Promise.all([first, second]);
    expect(auth.getNewAccessToken).toHaveBeenCalledTimes(1);
  });

  it('locks immediately when the refresh endpoint itself returns unauthorized', async () => {
    const handler = { handle: () => throwError(() => new HttpErrorResponse({ status: 401 })) };

    await expectAsync(firstValueFrom(interceptor.intercept(
      new HttpRequest('POST', '/users/me/access-token', {}), handler as any
    ))).toBeRejected();

    expect(auth.lock).toHaveBeenCalledTimes(1);
    expect(auth.getNewAccessToken).not.toHaveBeenCalled();
  });
});
