import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebRequestService {

  readonly ROOT_URL = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get(uri: string) {
    return this.http.get(`${this.ROOT_URL}/${uri}`, { withCredentials: true });
  }

  post(uri: string, payload: Object) {
    return this.http.post(`${this.ROOT_URL}/${uri}`, payload, { withCredentials: true });
  }

  patch(uri: string, payload: Object) {
    return this.http.patch(`${this.ROOT_URL}/${uri}`, payload, { withCredentials: true });
  }

  delete(uri: string) {
    return this.http.delete(`${this.ROOT_URL}/${uri}`, { withCredentials: true });
  }

  login(email: string, password: string) {
    return this.http.post(`${this.ROOT_URL}/users/login`, {
      email,
      password
    }, {
        observe: 'response',
        withCredentials: true
      });
  }

  signup(email: string, password: string) {
    return this.http.post(`${this.ROOT_URL}/users`, {
      email,
      password
    }, {
        observe: 'response',
        withCredentials: true
      });
  }


}
