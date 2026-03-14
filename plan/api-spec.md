# API Specification - VPN Manager

Base URL:

    /api/v1

------------------------------------------------------------------------

## Authentication

### Login

POST /auth/login

Request

``` json
{
  "username": "admin",
  "password": "password"
}
```

Response

``` json
{
  "token": "jwt_token"
}
```

------------------------------------------------------------------------

## Users

### Create VPN User

POST /users

``` json
{
  "username": "developer"
}
```

### List Users

GET /users

### Delete User

DELETE /users/{id}

------------------------------------------------------------------------

## VPN Nodes

### Register Node

POST /nodes/register

``` json
{
  "hostname": "vpn-node-1",
  "ip": "1.2.3.4"
}
```

### List Nodes

GET /nodes

------------------------------------------------------------------------

## VPN Sessions

GET /sessions

Returns active sessions.

------------------------------------------------------------------------

## Policies

POST /policies

``` json
{
  "user_id": "uuid",
  "network": "10.0.0.0/24"
}
```
