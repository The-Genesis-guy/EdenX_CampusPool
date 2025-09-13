import jwt
import datetime
from flask import current_app
from functools import wraps
from flask import request, jsonify
from bson.objectid import ObjectId

def generate_jwt_token(user_id, email, role):
    """
    Generate a JWT token for a user
    """
    payload = {
        'user_id': str(user_id),
        'email': email,
        'role': role,
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24),  # Token expires in 24 hours
        'iat': datetime.datetime.utcnow()  # Issued at
    }
    
    token = jwt.encode(payload, current_app.config['SECRET_KEY'], algorithm='HS256')
    return token

def verify_jwt_token(token):
    """
    Verify and decode a JWT token
    """
    try:
        payload = jwt.decode(token, current_app.config['SECRET_KEY'], algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

def token_required(f):
    """
    Decorator to require JWT token for protected routes
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check for token in Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]  # Bearer <token>
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        try:
            payload = verify_jwt_token(token)
            if payload is None:
                return jsonify({'error': 'Token is invalid or expired'}), 401
            
            # Add user info to request context
            request.current_user = {
                'user_id': payload['user_id'],
                'email': payload['email'],
                'role': payload['role']
            }
            
        except Exception as e:
            return jsonify({'error': 'Token verification failed'}), 401
        
        return f(*args, **kwargs)
    
    return decorated

def role_required(required_role):
    """
    Decorator to require specific role for routes
    """
    def decorator(f):
        @wraps(f)
        def decorated(*args, **kwargs):
            if not hasattr(request, 'current_user'):
                return jsonify({'error': 'Authentication required'}), 401
            
            if request.current_user['role'] != required_role:
                return jsonify({'error': 'Insufficient permissions'}), 403
            
            return f(*args, **kwargs)
        return decorated
    return decorator