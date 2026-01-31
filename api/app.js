const express = require('express');
const app = express();

const { mongoose } = require('./db/mongoose');

const bodyParser = require('body-parser');

// Load in the mongoose models
const { List, Task, User } = require('./db/models');

const jwt = require('jsonwebtoken');
const _ = require('lodash');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');


/* MIDDLEWARE  */

// Load middleware
app.use(bodyParser.json());
app.use(cookieParser());

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:4200')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) {
            return callback(null, true);
        }
        if (allowedOrigins.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'x-access-token', 'X-XSRF-TOKEN'],
    exposedHeaders: ['x-access-token']
}));

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 25,
    standardHeaders: true,
    legacyHeaders: false
});

const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).send({ errors: errors.array() });
    }
    next();
};


// check whether the request has a valid JWT access token
let authenticate = (req, res, next) => {
    let token = req.header('x-access-token');
    let secret;
    try {
        secret = User.getJWTSecret();
    } catch (e) {
        return res.status(500).send({ error: 'JWT_SECRET is not configured' });
    }

    // verify the JWT
    jwt.verify(token, secret, (err, decoded) => {
        if (err) {
            // there was an error
            // jwt is invalid - * DO NOT AUTHENTICATE *
            res.status(401).send(err);
        } else {
            // jwt is valid
            req.user_id = decoded._id;
            next();
        }
    });
}

// Verify Refresh Token Middleware (which will be verifying the session)
let verifySession = (req, res, next) => {
    // grab the refresh token from the request cookie
    let refreshToken = req.cookies['refreshToken'];
    if (!refreshToken) {
        return res.status(401).send({ error: 'Refresh token missing' });
    }

    User.findByToken(refreshToken).then((user) => {
        if (!user) {
            // user couldn't be found
            return Promise.reject({
                'error': 'User not found. Make sure that the refresh token and user id are correct'
            });
        }


        // if the code reaches here - the user was found
        // therefore the refresh token exists in the database - but we still have to check if it has expired or not

        req.user_id = user._id;
        req.userObject = user;
        req.refreshToken = refreshToken;

        let isSessionValid = false;

        user.sessions.forEach((session) => {
            if (session.token === refreshToken) {
                // check if the session has expired
                if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
                    // refresh token has not expired
                    isSessionValid = true;
                }
            }
        });

        if (isSessionValid) {
            // the session is VALID - call next() to continue with processing this web request
            next();
        } else {
            // the session is not valid
            return Promise.reject({
                'error': 'Refresh token has expired or the session is invalid'
            })
        }

    }).catch((e) => {
        res.status(401).send(e);
    })
}

let verifyCsrf = (req, res, next) => {
    const csrfCookie = req.cookies['XSRF-TOKEN'];
    const csrfHeader = req.header('X-XSRF-TOKEN');
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        return res.status(403).send({ error: 'Invalid CSRF token' });
    }
    next();
};

let cryptoRandomString = (length) => {
    const crypto = require('crypto');
    return crypto.randomBytes(length).toString('hex');
};

let setAuthCookies = (res, refreshToken) => {
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        sameSite: 'strict',
        secure: isProduction,
        path: '/users/me/access-token'
    });
    res.cookie('XSRF-TOKEN', cryptoRandomString(32), {
        httpOnly: false,
        sameSite: 'strict',
        secure: isProduction
    });
};

/* END MIDDLEWARE  */




/* ROUTE HANDLERS */

/* LIST ROUTES */

/**
 * GET /lists
 * Purpose: Get all lists
 */
app.get('/lists', authenticate, (req, res) => {
    // We want to return an array of all the lists that belong to the authenticated user 
    List.find({
        _userId: req.user_id
    }).then((lists) => {
        res.send(lists);
    }).catch((e) => {
        res.send(e);
    });
})

/**
 * POST /lists
 * Purpose: Create a list
 */
app.post('/lists', authenticate, (req, res) => {
    // We want to create a new list and return the new list document back to the user (which includes the id)
    // The list information (fields) will be passed in via the JSON request body
    let title = req.body.title;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return res.status(400).send({ error: 'Title is required' });
    }

    let newList = new List({
        title,
        _userId: req.user_id
    });
    newList.save().then((listDoc) => {
        // the full list document is returned (incl. id)
        res.send(listDoc);
    }).catch((e) => {
        res.status(500).send(e);
    })
});

/**
 * PATCH /lists/:id
 * Purpose: Update a specified list
 */
app.patch('/lists/:id', authenticate, (req, res) => {
    // We want to update the specified list (list document with id in the URL) with the new values specified in the JSON body of the request
    const updates = _.pick(req.body, ['title']);
    if (updates.title && (typeof updates.title !== 'string' || updates.title.trim().length === 0)) {
        return res.status(400).send({ error: 'Title must be a non-empty string' });
    }
    List.findOneAndUpdate({ _id: req.params.id, _userId: req.user_id }, {
        $set: updates
    }).then((listDoc) => {
        if (!listDoc) {
            return res.sendStatus(404);
        }
        res.send({ 'message': 'updated successfully'});
    }).catch((e) => {
        res.status(500).send(e);
    });
});

/**
 * DELETE /lists/:id
 * Purpose: Delete a list
 */
app.delete('/lists/:id', authenticate, (req, res) => {
    // We want to delete the specified list (document with id in the URL)
    List.findOneAndRemove({
        _id: req.params.id,
        _userId: req.user_id
    }).then((removedListDoc) => {
        if (!removedListDoc) {
            return res.sendStatus(404);
        }
        res.send(removedListDoc);

        // delete all the tasks that are in the deleted list
        deleteTasksFromList(removedListDoc._id);
    }).catch((e) => {
        res.status(500).send(e);
    })
});


/**
 * GET /lists/:listId/tasks
 * Purpose: Get all tasks in a specific list
 */
app.get('/lists/:listId/tasks', authenticate, (req, res) => {
    // We want to return all tasks that belong to a specific list (specified by listId)
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (!list) {
            return res.sendStatus(404);
        }

        return Task.find({
            _listId: req.params.listId
        }).then((tasks) => {
            res.send(tasks);
        });
    }).catch((e) => {
        res.status(500).send(e);
    });
});


/**
 * POST /lists/:listId/tasks
 * Purpose: Create a new task in a specific list
 */
app.post('/lists/:listId/tasks', authenticate, (req, res) => {
    // We want to create a new task in a list specified by listId

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            // list object with the specified conditions was found
            // therefore the currently authenticated user can create new tasks
            return true;
        }

        // else - the list object is undefined
        return false;
    }).then((canCreateTask) => {
        if (canCreateTask) {
            if (!req.body.title || typeof req.body.title !== 'string' || req.body.title.trim().length === 0) {
                return res.status(400).send({ error: 'Title is required' });
            }
            let newTask = new Task({
                title: req.body.title,
                _listId: req.params.listId
            });
            newTask.save().then((newTaskDoc) => {
                res.send(newTaskDoc);
            }).catch((e) => {
                res.status(500).send(e);
            })
        } else {
            res.sendStatus(404);
        }
    }).catch((e) => {
        res.status(500).send(e);
    })
})

/**
 * PATCH /lists/:listId/tasks/:taskId
 * Purpose: Update an existing task
 */
app.patch('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    // We want to update an existing task (specified by taskId)

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            // list object with the specified conditions was found
            // therefore the currently authenticated user can make updates to tasks within this list
            return true;
        }

        // else - the list object is undefined
        return false;
    }).then((canUpdateTasks) => {
        if (canUpdateTasks) {
            const updates = _.pick(req.body, ['title', 'completed']);
            if (updates.title && (typeof updates.title !== 'string' || updates.title.trim().length === 0)) {
                return res.status(400).send({ error: 'Title must be a non-empty string' });
            }
            // the currently authenticated user can update tasks
            Task.findOneAndUpdate({
                _id: req.params.taskId,
                _listId: req.params.listId
            }, {
                    $set: updates
                }
            ).then((taskDoc) => {
                if (!taskDoc) {
                    return res.sendStatus(404);
                }
                res.send({ message: 'Updated successfully.' })
            }).catch((e) => {
                res.status(500).send(e);
            })
        } else {
            res.sendStatus(404);
        }
    }).catch((e) => {
        res.status(500).send(e);
    })
});

/**
 * DELETE /lists/:listId/tasks/:taskId
 * Purpose: Delete a task
 */
app.delete('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            // list object with the specified conditions was found
            // therefore the currently authenticated user can make updates to tasks within this list
            return true;
        }

        // else - the list object is undefined
        return false;
    }).then((canDeleteTasks) => {
        
        if (canDeleteTasks) {
            Task.findOneAndRemove({
                _id: req.params.taskId,
                _listId: req.params.listId
            }).then((removedTaskDoc) => {
                if (!removedTaskDoc) {
                    return res.sendStatus(404);
                }
                res.send(removedTaskDoc);
            }).catch((e) => {
                res.status(500).send(e);
            })
        } else {
            res.sendStatus(404);
        }
    }).catch((e) => {
        res.status(500).send(e);
    });
});



/* USER ROUTES */

/**
 * POST /users
 * Purpose: Sign up
 */
app.post('/users', authLimiter, [
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8 })
], validateRequest, (req, res) => {
    // User sign up

    let body = _.pick(req.body, ['email', 'password']);
    let newUser = new User(body);

    newUser.save().then(() => {
        return newUser.createSession();
    }).then((refreshToken) => {
        // Session created successfully - refreshToken returned.
        // now we geneate an access auth token for the user

        return newUser.generateAccessAuthToken().then((accessToken) => {
            // access auth token generated successfully, now we return an object containing the auth tokens
            return { accessToken, refreshToken }
        });
    }).then((authTokens) => {
        // Now we construct and send the response to the user with their auth tokens in the header and the user object in the body
        setAuthCookies(res, authTokens.refreshToken);
        res
            .header('x-access-token', authTokens.accessToken)
            .send(newUser);
    }).catch((e) => {
        res.status(400).send(e);
    })
})


/**
 * POST /users/login
 * Purpose: Login
 */
app.post('/users/login', authLimiter, [
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8 })
], validateRequest, (req, res) => {
    let email = req.body.email;
    let password = req.body.password;

    User.findByCredentials(email, password).then((user) => {
        return user.createSession().then((refreshToken) => {
            // Session created successfully - refreshToken returned.
            // now we geneate an access auth token for the user

            return user.generateAccessAuthToken().then((accessToken) => {
                // access auth token generated successfully, now we return an object containing the auth tokens
                return { accessToken, refreshToken }
            });
        }).then((authTokens) => {
            // Now we construct and send the response to the user with their auth tokens in the header and the user object in the body
            setAuthCookies(res, authTokens.refreshToken);
            res
                .header('x-access-token', authTokens.accessToken)
                .send(user);
        })
    }).catch((e) => {
        res.status(400).send(e);
    });
})


/**
 * GET /users/me/access-token
 * Purpose: generates and returns an access token
 */
app.post('/users/me/access-token', authLimiter, verifySession, verifyCsrf, (req, res) => {
    // we know that the user/caller is authenticated and we have the user_id and user object available to us
    req.userObject.generateAccessAuthToken().then((accessToken) => {
        setAuthCookies(res, req.refreshToken);
        res.header('x-access-token', accessToken).send({ accessToken });
    }).catch((e) => {
        res.status(400).send(e);
    });
})



/* HELPER METHODS */
let deleteTasksFromList = (_listId) => {
    Task.deleteMany({
        _listId
    }).then(() => {
        console.log("Tasks from " + _listId + " were deleted!");
    })
}




app.listen(3000, () => {
    console.log("Server is listening on port 3000");
})
