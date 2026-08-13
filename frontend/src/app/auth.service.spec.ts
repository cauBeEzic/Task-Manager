import { HttpHeaders, HttpResponse } from '@angular/common/http';
import { firstValueFrom, of } from 'rxjs';
import { AuthService } from './auth.service';

describe('AuthService offline-data safety', () => {
  let web: any;
  let router: any;
  let http: any;
  let offlineDb: any;
  let service: AuthService;

  const response = (userId = 'user-a', token = 'token-a') => new HttpResponse({
    status: 200,
    body: { _id: userId },
    headers: new HttpHeaders({ 'x-access-token': token })
  });

  beforeEach(() => {
    web = {
      ROOT_URL: 'http://api.test',
      login: jasmine.createSpy('login'),
      signup: jasmine.createSpy('signup')
    };
    router = { navigate: jasmine.createSpy('navigate').and.returnValue(Promise.resolve(true)) };
    http = { post: jasmine.createSpy('post') };
    offlineDb = {
      activateUser: jasmine.createSpy('activateUser').and.returnValue(Promise.resolve()),
      clearAll: jasmine.createSpy('clearAll').and.returnValue(Promise.resolve())
    };
    service = new AuthService(web, router, http, offlineDb);
  });

  it('activates the authenticated user namespace before retaining the login token', async () => {
    web.login.and.returnValue(of(response('user-b', 'token-b')));

    await firstValueFrom(service.login('b@example.com', 'password'));

    expect(offlineDb.activateUser).toHaveBeenCalledOnceWith('user-b');
    expect(service.getAccessToken()).toBe('token-b');
  });

  it('also isolates data after signup', async () => {
    web.signup.and.returnValue(of(response('new-user', 'new-token')));

    await firstValueFrom(service.signup('new@example.com', 'password'));

    expect(offlineDb.activateUser).toHaveBeenCalledOnceWith('new-user');
    expect(service.getAccessToken()).toBe('new-token');
  });

  it('rejects malformed authentication responses without activating cached data', async () => {
    web.login.and.returnValue(of(new HttpResponse({ status: 200, body: {} })));

    await expectAsync(firstValueFrom(service.login('bad@example.com', 'password'))).toBeRejectedWithError(
      'Authentication response did not include a user id'
    );
    expect(offlineDb.activateUser).not.toHaveBeenCalled();
  });

  it('locks on transient authentication failure without deleting pending offline work', () => {
    service.setAccessToken('temporary-token');

    service.lock();

    expect(service.getAccessToken()).toBeNull();
    expect(offlineDb.clearAll).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login']);
  });

  it('awaits local cleanup for an explicit logout', async () => {
    service.setAccessToken('temporary-token');

    await service.logout();

    expect(offlineDb.clearAll).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledOnceWith(['/login']);
  });

  it('revokes the server session before explicitly clearing local data', async () => {
    http.post.and.returnValue(of({}));

    await firstValueFrom(service.logoutRequest());

    expect(http.post).toHaveBeenCalledWith('http://api.test/users/logout', {}, { withCredentials: true });
    expect(offlineDb.clearAll).toHaveBeenCalled();
  });

  it('stores a refreshed access token', async () => {
    http.post.and.returnValue(of(response('user-a', 'refreshed-token')));

    await firstValueFrom(service.getNewAccessToken());

    expect(service.getAccessToken()).toBe('refreshed-token');
  });
});
