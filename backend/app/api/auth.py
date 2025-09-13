from flask import Blueprint, request, jsonify, make_response, current_app
from ..models.user_model import User
from .. import mongo
from ..utils.jwt_utils import generate_jwt_token, verify_jwt_token, token_required
import datetime
import secrets

auth_bp = Blueprint('auth_bp', __name__)

ALLOWED_EMAIL_DOMAIN = "kristujayanti.com"
CONFIRMATION_TOKEN_EXPIRATION_HOURS = 24

@auth_bp.route('/register', methods=['POST'])
def register():
    data = request.get_json()
    if not all(k in data for k in ['email', 'password', 'name', 'homeAddress', 'coordinates', 'role']):
        return jsonify({"error": "Missing required fields"}), 400

    email = data['email']
    if not email.endswith(f"@{ALLOWED_EMAIL_DOMAIN}"):
        return jsonify({"error": f"Invalid email domain. Please use your @{ALLOWED_EMAIL_DOMAIN} email."}), 400

    if User.find_by_email(email):
        return jsonify({"error": "Email already registered"}), 409

    coordinates = data['coordinates']
    if not isinstance(coordinates, list) or len(coordinates) != 2:
        return jsonify({"error": "Invalid coordinates format"}), 400

    new_user = User(
        name=data['name'],
        email=email,
        password=data['password'],
        home_address_text=data['homeAddress'],
        coordinates=coordinates,
        role=data['role']
    )
    result = new_user.save()

    token = secrets.token_urlsafe(32)
    token_expiry = datetime.datetime.utcnow() + datetime.timedelta(hours=CONFIRMATION_TOKEN_EXPIRATION_HOURS)
    
    mongo.db.users.update_one(
        {"_id": result.inserted_id},
        {"$set": {"confirmation_token": token, "confirmation_token_expiry": token_expiry}}
    )

    confirmation_url = f"http://127.0.0.1:5000/api/auth/confirm/{token}"
    print("--------------------------------------------------")
    print(f"CONFIRMATION LINK for {email}: {confirmation_url}")
    print("--------------------------------------------------")

    return jsonify({"message": "Registration successful!"}), 201

@auth_bp.route('/confirm/<token>', methods=['GET'])
def confirm_email(token):
    user = mongo.db.users.find_one({"confirmation_token": token})
    if not user or datetime.datetime.utcnow() > user['confirmation_token_expiry']:
        return make_response("<h1>Invalid or expired confirmation link.</h1>", 404)

    mongo.db.users.update_one(
        {"_id": user['_id']},
        {"$set": {"status": "verified"}, "$unset": {"confirmation_token": "", "confirmation_token_expiry": ""}}
    )

    return make_response("<h1>Your email has been confirmed successfully! You can now log in.</h1>", 200)

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('email') or not data.get('password'):
        return jsonify({"error": "Missing email or password"}), 400

    user_data = User.find_by_email(data['email'])
    if user_data and user_data.get('status') != 'verified':
        return jsonify({"error": "Account not verified. Please check your console for the confirmation link."}), 403

    from flask_bcrypt import Bcrypt
    bcrypt = Bcrypt()
    if user_data and bcrypt.check_password_hash(user_data['password_hash'], data['password']):
        # Generate JWT token
        token = generate_jwt_token(
            user_id=user_data['_id'],
            email=user_data['email'],
            role=user_data['role']
        )
        
        return jsonify({
            "message": "Login successful!",
            "token": token,
            "user": {
                "id": str(user_data['_id']),
                "name": user_data['name'],
                "email": user_data['email'],
                "role": user_data['role']
            }
        }), 200
    else:
        return jsonify({"error": "Invalid credentials"}), 401

@auth_bp.route('/verify-token', methods=['POST'])
@token_required
def verify_token():
    """Verify if the current token is valid"""
    return jsonify({
        "message": "Token is valid",
        "user": request.current_user
    }), 200

@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout():
    """Logout endpoint (client should remove token)"""
    return jsonify({"message": "Logged out successfully"}), 200

@auth_bp.route('/profile', methods=['GET'])
@token_required
def get_profile():
    """Get current user profile"""
    user_data = User.find_by_id(request.current_user['user_id'])
    if not user_data:
        return jsonify({"error": "User not found"}), 404
    
    return jsonify({
        "user": {
            "id": str(user_data['_id']),
            "name": user_data['name'],
            "email": user_data['email'],
            "role": user_data['role'],
            "homeAddress": user_data['home_address_text'],
            "coordinates": user_data['homeLocation']['coordinates'],
            "averageRating": user_data['averageRating'],
            "driverStatus": user_data.get('driverStatus', 'not_applicable')
        }
    }), 200