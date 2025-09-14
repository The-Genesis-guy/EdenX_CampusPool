# Add this to your existing backend/app/api/ directory as profiles.py

from flask import Blueprint, request, jsonify
from ..utils.jwt_utils import token_required
from .. import mongo
from bson.objectid import ObjectId
import datetime

profiles_bp = Blueprint('profiles_bp', __name__)

@profiles_bp.route('/check', methods=['GET'])
@token_required
def check_profile_completion():
    """Check if user has completed their profile"""
    user_id = request.current_user['user_id']
    
    # Check if profile exists
    profile = mongo.db.user_profiles.find_one({"user_id": ObjectId(user_id)})
    
    if not profile:
        return jsonify({
            "profile_complete": False,
            "missing_fields": ["phone_number"]
        }), 200
    
    # Check required fields based on user role
    user_role = request.current_user['role']
    required_fields = ['phone_number']
    
    if user_role == 'driver':
        required_fields.extend(['vehicle_model', 'vehicle_color', 'vehicle_plate'])
    
    missing_fields = []
    for field in required_fields:
        if field not in profile or not profile[field]:
            missing_fields.append(field)
    
    return jsonify({
        "profile_complete": len(missing_fields) == 0,
        "missing_fields": missing_fields,
        "profile_data": profile if len(missing_fields) == 0 else None
    }), 200

@profiles_bp.route('/complete', methods=['POST'])
@token_required
def complete_profile():
    """Complete or update user profile"""
    user_id = request.current_user['user_id']
    user_role = request.current_user['role']
    data = request.get_json()
    
    # Validate phone number
    phone_number = data.get('phone_number')
    if not phone_number or len(phone_number) != 10 or not phone_number.isdigit():
        return jsonify({"error": "Valid 10-digit phone number is required"}), 400
    
    # Prepare profile data
    profile_data = {
        "user_id": ObjectId(user_id),
        "phone_number": phone_number,
        "emergency_contact": data.get('emergency_contact'),
        "college_id": data.get('college_id'),
        "updated_at": datetime.datetime.utcnow()
    }
    
    # Add driver-specific fields
    if user_role == 'driver':
        required_driver_fields = ['vehicle_model', 'vehicle_color', 'vehicle_plate']
        for field in required_driver_fields:
            if not data.get(field):
                return jsonify({"error": f"{field.replace('_', ' ').title()} is required for drivers"}), 400
            profile_data[field] = data[field]
        
        # Add optional driver fields
        profile_data['driving_experience_years'] = data.get('driving_experience_years', 0)
        profile_data['preferred_routes'] = data.get('preferred_routes', [])
    
    # Check if profile already exists
    existing_profile = mongo.db.user_profiles.find_one({"user_id": ObjectId(user_id)})
    
    if existing_profile:
        # Update existing profile
        profile_data['created_at'] = existing_profile.get('created_at', datetime.datetime.utcnow())
        result = mongo.db.user_profiles.replace_one(
            {"user_id": ObjectId(user_id)},
            profile_data
        )
        message = "Profile updated successfully!"
    else:
        # Create new profile
        profile_data['created_at'] = datetime.datetime.utcnow()
        result = mongo.db.user_profiles.insert_one(profile_data)
        message = "Profile completed successfully!"
    
    if result.modified_count > 0 or result.inserted_id:
        return jsonify({
            "message": message,
            "profile_complete": True
        }), 200
    else:
        return jsonify({"error": "Failed to save profile"}), 500

@profiles_bp.route('/get', methods=['GET'])
@token_required
def get_profile():
    """Get user profile information"""
    user_id = request.current_user['user_id']
    
    # Get user basic info
    user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    # Get profile info
    profile = mongo.db.user_profiles.find_one({"user_id": ObjectId(user_id)})
    
    response_data = {
        "user": {
            "name": user['name'],
            "email": user['email'],
            "role": user['role'],
            "average_rating": user.get('averageRating', 0),
            "total_rides": user.get('totalRides', 0)
        },
        "profile": profile if profile else None,
        "profile_complete": profile is not None and 'phone_number' in profile
    }
    
    return jsonify(response_data), 200

@profiles_bp.route('/update', methods=['PUT'])
@token_required
def update_profile():
    """Update specific profile fields"""
    user_id = request.current_user['user_id']
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    # Check if profile exists
    existing_profile = mongo.db.user_profiles.find_one({"user_id": ObjectId(user_id)})
    if not existing_profile:
        return jsonify({"error": "Profile not found. Please complete profile first."}), 404
    
    # Validate phone number if provided
    if 'phone_number' in data:
        phone_number = data['phone_number']
        if not phone_number or len(phone_number) != 10 or not phone_number.isdigit():
            return jsonify({"error": "Valid 10-digit phone number is required"}), 400
    
    # Prepare update data
    update_data = {"updated_at": datetime.datetime.utcnow()}
    
    # Only update provided fields
    allowed_fields = ['phone_number', 'emergency_contact', 'college_id', 
                     'vehicle_model', 'vehicle_color', 'vehicle_plate',
                     'driving_experience_years', 'preferred_routes']
    
    for field in allowed_fields:
        if field in data:
            update_data[field] = data[field]
    
    # Update profile
    result = mongo.db.user_profiles.update_one(
        {"user_id": ObjectId(user_id)},
        {"$set": update_data}
    )
    
    if result.modified_count > 0:
        return jsonify({"message": "Profile updated successfully!"}), 200
    else:
        return jsonify({"error": "No changes made or profile not found"}), 400

@profiles_bp.route('/driver-info/<driver_id>', methods=['GET'])
@token_required
def get_driver_info(driver_id):
    """Get driver information for ride requests (public info only)"""
    try:
        # Get driver basic info
        driver = mongo.db.users.find_one({"_id": ObjectId(driver_id)})
        if not driver or driver['role'] != 'driver':
            return jsonify({"error": "Driver not found"}), 404
        
        # Get driver profile
        profile = mongo.db.user_profiles.find_one({"user_id": ObjectId(driver_id)})
        
        response_data = {
            "driver_id": driver_id,
            "name": driver['name'],
            "rating": driver.get('averageRating', 0),
            "total_rides": driver.get('totalRides', 0),
            "vehicle_info": {
                "model": profile.get('vehicle_model', 'Not specified') if profile else 'Not specified',
                "color": profile.get('vehicle_color', 'Not specified') if profile else 'Not specified'
                # Note: We don't share plate number publicly
            },
            "driving_experience": profile.get('driving_experience_years', 0) if profile else 0
        }
        
        return jsonify(response_data), 200
        
    except Exception as e:
        return jsonify({"error": "Invalid driver ID"}), 400

@profiles_bp.route('/statistics', methods=['GET'])
@token_required
def get_profile_statistics():
    """Get user's ride statistics"""
    user_id = request.current_user['user_id']
    user_role = request.current_user['role']
    
    # Get basic user stats
    user = mongo.db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        return jsonify({"error": "User not found"}), 404
    
    # Get ride history statistics
    if user_role == 'driver':
        # Driver statistics
        driver_stats = mongo.db.ride_requests.aggregate([
            {"$match": {"driver_id": ObjectId(user_id), "status": "completed"}},
            {"$group": {
                "_id": None,
                "total_completed_rides": {"$sum": 1},
                "total_earnings": {"$sum": "$estimated_fare"},
                "average_fare": {"$avg": "$estimated_fare"}
            }}
        ])
        driver_stats = list(driver_stats)
        
        stats = {
            "total_rides": driver_stats[0]["total_completed_rides"] if driver_stats else 0,
            "total_earnings": driver_stats[0]["total_earnings"] if driver_stats else 0,
            "average_fare": round(driver_stats[0]["average_fare"], 2) if driver_stats else 0,
            "average_rating": user.get('averageRating', 0),
            "role": "driver"
        }
    else:
        # Rider statistics
        rider_stats = mongo.db.ride_requests.aggregate([
            {"$match": {"rider_id": ObjectId(user_id), "status": "completed"}},
            {"$group": {
                "_id": None,
                "total_completed_rides": {"$sum": 1},
                "total_spent": {"$sum": "$estimated_fare"},
                "average_fare": {"$avg": "$estimated_fare"}
            }}
        ])
        rider_stats = list(rider_stats)
        
        stats = {
            "total_rides": rider_stats[0]["total_completed_rides"] if rider_stats else 0,
            "total_spent": rider_stats[0]["total_spent"] if rider_stats else 0,
            "average_fare": round(rider_stats[0]["average_fare"], 2) if rider_stats else 0,
            "average_rating": user.get('averageRating', 0),
            "role": "rider"
        }
    
    # Get recent ride history (last 5 rides)
    recent_rides_pipeline = [
        {"$match": {
            f"{'driver_id' if user_role == 'driver' else 'rider_id'}": ObjectId(user_id),
            "status": "completed"
        }},
        {"$sort": {"completed_at": -1}},
        {"$limit": 5},
        {"$lookup": {
            "from": "users",
            "localField": f"{'rider_id' if user_role == 'driver' else 'driver_id'}",
            "foreignField": "_id",
            "as": "other_user"
        }},
        {"$unwind": "$other_user"}
    ]
    
    recent_rides = list(mongo.db.ride_requests.aggregate(recent_rides_pipeline))
    
    formatted_recent_rides = []
    for ride in recent_rides:
        formatted_recent_rides.append({
            "date": ride.get('completed_at').strftime("%Y-%m-%d %H:%M") if ride.get('completed_at') else 'Unknown',
            "other_user": ride['other_user']['name'],
            "pickup": ride['pickup_address'],
            "destination": ride['destination_address'],
            "fare": ride.get('estimated_fare', 0)
        })
    
    stats['recent_rides'] = formatted_recent_rides
    
    return jsonify(stats), 200