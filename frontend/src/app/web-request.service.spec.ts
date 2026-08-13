import { WebRequestService } from './web-request.service';

describe('WebRequestService', () => {
  it('constructs authenticated API requests', () => {
    const http = {
      get: jasmine.createSpy('get'), post: jasmine.createSpy('post'),
      patch: jasmine.createSpy('patch'), delete: jasmine.createSpy('delete')
    };
    const service = new WebRequestService(http as any);

    service.get('lists');
    service.post('lists', { title: 'x' });
    service.patch('lists/1', { title: 'y' });
    service.delete('lists/1');
    service.login('a@example.com', 'password');
    service.signup('a@example.com', 'password');

    expect(http.get).toHaveBeenCalled();
    expect(http.patch).toHaveBeenCalled();
    expect(http.delete).toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledTimes(3);
  });
});
