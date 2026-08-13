import { HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { LoginPageComponent } from './login-page.component';

describe('LoginPageComponent', () => {
  it('navigates after successful login', () => {
    const auth = { login: jasmine.createSpy('login').and.returnValue(of(new HttpResponse({ status: 200 }))) };
    const router = { navigate: jasmine.createSpy('navigate') };
    const component = new LoginPageComponent(auth as any, router as any);

    component.onLoginButtonClicked('user@example.com', 'password');

    expect(auth.login).toHaveBeenCalledOnceWith('user@example.com', 'password');
    expect(router.navigate).toHaveBeenCalledOnceWith(['/lists']);
  });
});
