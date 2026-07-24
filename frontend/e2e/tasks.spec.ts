import { request as playwrightRequest, test, expect } from '@playwright/test';
import {
  accessTokenHeaders,
  API_URL,
  signUp,
  uniqueEmail
} from './helpers';

test('creates a task in an owned list', async ({ request }) => {
  const { accessToken } = await signUp(request, uniqueEmail('create-task'));
  const headers = accessTokenHeaders(accessToken);

  const listResponse = await request.post(`${API_URL}/lists`, {
    headers,
    data: { title: 'Playwright list' }
  });
  expect(listResponse.status(), await listResponse.text()).toBe(200);
  const list = await listResponse.json();

  const taskResponse = await request.post(
    `${API_URL}/lists/${list._id}/tasks`,
    {
      headers,
      data: { title: 'Task created by Playwright' }
    }
  );

  expect(taskResponse.status(), await taskResponse.text()).toBe(200);
  await expect(taskResponse.json()).resolves.toMatchObject({
    title: 'Task created by Playwright',
    _listId: list._id,
    completed: false
  });
});

test('edits and deletes a task', async ({ request }) => {
  const { accessToken } = await signUp(request, uniqueEmail('edit-task'));
  const headers = accessTokenHeaders(accessToken);

  const listResponse = await request.post(`${API_URL}/lists`, {
    headers,
    data: { title: 'Task lifecycle list' }
  });
  expect(listResponse.status(), await listResponse.text()).toBe(200);
  const list = await listResponse.json();

  const createResponse = await request.post(
    `${API_URL}/lists/${list._id}/tasks`,
    {
      headers,
      data: { title: 'Original task title' }
    }
  );
  expect(createResponse.status(), await createResponse.text()).toBe(200);
  const task = await createResponse.json();

  const editResponse = await request.patch(
    `${API_URL}/lists/${list._id}/tasks/${task._id}`,
    {
      headers,
      data: { title: 'Edited task title' }
    }
  );
  expect(editResponse.status(), await editResponse.text()).toBe(200);

  const tasksAfterEdit = await request.get(
    `${API_URL}/lists/${list._id}/tasks`,
    { headers }
  );
  await expect(tasksAfterEdit.json()).resolves.toEqual([
    expect.objectContaining({
      _id: task._id,
      title: 'Edited task title'
    })
  ]);

  const deleteResponse = await request.delete(
    `${API_URL}/lists/${list._id}/tasks/${task._id}`,
    { headers }
  );
  expect(deleteResponse.status(), await deleteResponse.text()).toBe(200);

  const tasksAfterDelete = await request.get(
    `${API_URL}/lists/${list._id}/tasks`,
    { headers }
  );
  expect(await tasksAfterDelete.json()).toEqual([]);
});

test('isolates lists and tasks between users', async () => {
  const userARequest = await playwrightRequest.newContext({
    baseURL: API_URL
  });
  const userBRequest = await playwrightRequest.newContext({
    baseURL: API_URL
  });

  try {
    const userA = await signUp(userARequest, uniqueEmail('owner'));
    const userB = await signUp(userBRequest, uniqueEmail('other-user'));
    const userAHeaders = accessTokenHeaders(userA.accessToken);
    const userBHeaders = accessTokenHeaders(userB.accessToken);

    const listResponse = await userARequest.post('/lists', {
      headers: userAHeaders,
      data: { title: 'User A private list' }
    });
    expect(listResponse.status(), await listResponse.text()).toBe(200);
    const list = await listResponse.json();

    const taskResponse = await userARequest.post(
      `/lists/${list._id}/tasks`,
      {
        headers: userAHeaders,
        data: { title: 'User A private task' }
      }
    );
    expect(taskResponse.status(), await taskResponse.text()).toBe(200);
    const task = await taskResponse.json();

    const userBListsResponse = await userBRequest.get('/lists', {
      headers: userBHeaders
    });
    expect(await userBListsResponse.json()).toEqual([]);

    const readResponse = await userBRequest.get(
      `/lists/${list._id}/tasks`,
      { headers: userBHeaders }
    );
    expect(readResponse.status()).toBe(404);

    const createResponse = await userBRequest.post(
      `/lists/${list._id}/tasks`,
      {
        headers: userBHeaders,
        data: { title: 'Unauthorized task' }
      }
    );
    expect(createResponse.status()).toBe(404);

    const editResponse = await userBRequest.patch(
      `/lists/${list._id}/tasks/${task._id}`,
      {
        headers: userBHeaders,
        data: { title: 'Unauthorized edit' }
      }
    );
    expect(editResponse.status()).toBe(404);

    const deleteResponse = await userBRequest.delete(
      `/lists/${list._id}/tasks/${task._id}`,
      { headers: userBHeaders }
    );
    expect(deleteResponse.status()).toBe(404);

    const ownerTasksResponse = await userARequest.get(
      `/lists/${list._id}/tasks`,
      { headers: userAHeaders }
    );
    await expect(ownerTasksResponse.json()).resolves.toEqual([
      expect.objectContaining({
        _id: task._id,
        title: 'User A private task'
      })
    ]);
  } finally {
    await userARequest.dispose();
    await userBRequest.dispose();
  }
});
