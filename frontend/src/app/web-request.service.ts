import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class WebRequestService {

  readonly ROOT_URL = environment.apiUrl;

  constructor(private http: HttpClient) {}

  get<T = unknown>(uri: string) {
    return this.http.get<T>(`${this.ROOT_URL}/${uri}`, { withCredentials: true });
  }

  post<T = unknown>(uri: string, payload: object) {
    return this.http.post<T>(`${this.ROOT_URL}/${uri}`, payload, { withCredentials: true });
  }

  patch<T = unknown>(uri: string, payload: object) {
    return this.http.patch<T>(`${this.ROOT_URL}/${uri}`, payload, { withCredentials: true });
  }

  delete<T = unknown>(uri: string) {
    return this.http.delete<T>(`${this.ROOT_URL}/${uri}`, { withCredentials: true });
  }

  login(email: string, password: string) {
    return this.http.post<{ _id?: string }>(`${this.ROOT_URL}/users/login`, {
      email,
      password
    }, {
        observe: 'response',
        withCredentials: true
      });
  }

  signup(email: string, password: string) {
    return this.http.post<{ _id?: string }>(`${this.ROOT_URL}/users`, {
      email,
      password
    }, {
        observe: 'response',
        withCredentials: true
      });
  }


}
