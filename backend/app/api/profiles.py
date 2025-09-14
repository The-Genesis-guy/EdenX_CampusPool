from flask import Blueprint, request, jsonify
from ..models.profile_model import UserProfile
from ..models.user_model import User
from ..utils.jwt_utils import token_required

profiles_bp = Blueprint('profiles_bp', __name__)

@profiles_bp.route('/complete', methods=['POST'])
@token_required
def complete_profile():
    """Complete user profile after registration"""
    data = request.get_json()
    user_id = request.current_user['user_id']
    user_role = request.current_user['role']
    
    # Common required fields
    required_fields = ['phone_number']
    
    # Additional fields for drivers
    if user_role == 'driver':
        required_fields.extend(['vehicle_model', 'vehicle_color', 'vehicle_plate'])
    
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required profile fields"}), 400
    
    # Validate phone number
    phone = data['phone_number']
    if not phone.isdigit() or len(phone) != 10:
        return jsonify({"error": "Invalid phone number. Use 10-digit format"}), 400
    
    # Prepare vehicle details for drivers
    vehicle_details = None
    if user_role == 'driver':
        vehicle_details = {
            "model": data['vehicle_model'],
            "color": data['vehicle_color'], 
            "plate_number": data['vehicle_plate']
        }
    
    try:
        profile = UserProfile(
            user_id=user_id,
            phone_number=phone,
            emergency_contact=data.get('emergency_contact'),
            vehicle_details=vehicle_details,
            college_id=data.get('college_id')
        )
        
        result = profile.save()
        
        return jsonify({
            "message": "Profile completed successfully!",
            "profile_id": str(result.inserted_id)
        }), 201
        
    except Exception as e:
        return jsonify({"error": f"Failed to save profile: {str(e)}"}), 500

@profiles_bp.route('/check', methods=['GET'])
@token_required
def check_profile_status():
    """Check if user has completed their profile"""
    user_id = request.current_user['user_id']
    
    user = User.find_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    is_complete = user.get('is_profile_complete', False)
    
    if is_complete:
        profile = UserProfile.find_by_user_id(user_id)
        if profile:
            return jsonify({
                "profile_complete": True,
                "profile": {
                    "phone_number": profile['phone_number'],
                    "emergency_contact": profile.get('emergency_contact'),
                    "vehicle_details": profile.get('vehicle_details'),
                    "college_id": profile.get('college_id')
                }
            }), 200
    
    return jsonify({
        "profile_complete": False,
        "message": "Please complete your profile to continue"
    }), 200

@profiles_bp.route('/update', methods=['PUT'])
@token_required
def update_profile():
    """Update existing user profile"""
    data = request.get_json()
    user_id = request.current_user['user_id']
    
    # Allowed fields for update
    allowed_fields = [
        'phone_number', 'emergency_contact', 'vehicle_details', 'college_id'
    ]
    
    update_data = {k: v for k, v in data.items() if k in allowed_fields}
    
    if not update_data:
        return jsonify({"error": "No valid fields to update"}), 400
    
    try:
        result = UserProfile.update_profile(user_id, update_data)
        
        if result.modified_count > 0:
            return jsonify({"message": "Profile updated successfully"}), 200
        else:
            return jsonify({"message": "No changes made"}), 200
            
    except Exception as e:
        return jsonify({"error": f"Failed to update profile: {str(e)}"}), 500

@profiles_bp.route('/', methods=['GET'])
@token_required
def get_profile():
    """Get current user's complete profile"""
    user_id = request.current_user['user_id']
    
    # Get user basic info
    user = User.find_by_id(user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    # Get extended profile
    profile = UserProfile.find_by_user_id(user_id)
    
    response_data = {
        "user": {
            "id": str(user['_id']),
            "name": user['name'],
            "email": user['email'],
            "role": user['role'],
            "home_address": user['home_address_text'],
            "coordinates": user['homeLocation']['coordinates'],
            "average_rating": user.get('averageRating', 0),
            "driver_status": user.get('driverStatus', 'not_applicable'),
            "profile_complete": user.get('is_profile_complete', False)
        }
    }
    
    if profile:
        response_data["profile"] = {
            "phone_number": profile['phone_number'],
            "emergency_contact": profile.get('emergency_contact'),
            "vehicle_details": profile.get('vehicle_details'),
            "college_id": profile.get('college_id'),
            "created_at": profile['created_at'].isoformat(),
            "updated_at": profile['updated_at'].isoformat()
        }
    
    return jsonify(response_data), 200