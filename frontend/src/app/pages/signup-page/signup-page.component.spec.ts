import { HttpResponse } from '@angular/common/http';
import { of } from 'rxjs';
import { SignupPageComponent } from './signup-page.component';

describe('SignupPageComponent', () => {
  it('navigates after signup', () => {
    const auth = { signup: jasmine.createSpy('signup').and.returnValue(of(new HttpResponse({ status: 200 }))) };
    const router = { navigate: jasmine.createSpy('navigate') };
    const component = new SignupPageComponent(auth as any, router as any);

    component.onSignupButtonClicked('user@example.com', 'password');

    expect(auth.signup).toHaveBeenCalledOnceWith('user@example.com', 'password');
    expect(router.navigate).toHaveBeenCalledOnceWith(['/lists']);
  });
});
