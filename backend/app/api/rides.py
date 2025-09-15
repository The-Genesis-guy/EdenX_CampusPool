from flask import Blueprint, request, jsonify
from app.models.ride_model import Ride, RideRequest, PreBookRequest
from app.models.user_model import User
from app.utils.jwt_utils import token_required, role_required
from app.utils.distance_utils import calculate_haversine_distance, calculate_smart_score, calculate_cost_sharing_fare
from app import mongo
from bson.objectid import ObjectId
import random
import string
import datetime

rides_bp = Blueprint('rides_bp', __name__)

@rides_bp.route('/go-live', methods=['POST'])
@token_required
@role_required('driver')
def go_live():
    """Driver endpoint to go live and start accepting rides"""
    data = request.get_json()
    
    required_fields = ['pickup_location', 'destination_location', 
                      'pickup_address', 'destination_address']
    
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    driver_id = request.current_user['user_id']
    
    # Check if driver is already live
    existing_ride = Ride.find_by_driver_id(driver_id)
    if existing_ride:
        return jsonify({"error": "You are already live. End current ride first."}), 409
    
    # Validate coordinates
    pickup_coords = data['pickup_location']
    dest_coords = data['destination_location']
    
    if not isinstance(pickup_coords, list) or len(pickup_coords) != 2:
        return jsonify({"error": "Invalid pickup location format"}), 400
    if not isinstance(dest_coords, list) or len(dest_coords) != 2:
        return jsonify({"error": "Invalid destination location format"}), 400
    
    # Create GeoJSON Point objects
    pickup_geojson = {
        "type": "Point",
        "coordinates": pickup_coords
    }
    
    dest_geojson = {
        "type": "Point", 
        "coordinates": dest_coords
    }
    
    # Create new ride
    new_ride = Ride(
        driver_id=driver_id,
        pickup_location=pickup_geojson,
        destination_location=dest_geojson,
        pickup_address=data['pickup_address'],
        destination_address=data['destination_address'],
        seats_available=data.get('seats_available', 1)
    )
    
    result = new_ride.save()
    
    return jsonify({
        "message": "You are now live!",
        "ride_id": str(result.inserted_id)
    }), 201

@rides_bp.route('/go-offline', methods=['POST'])
@token_required
@role_required('driver')
def go_offline():
    """Driver endpoint to go offline"""
    driver_id = request.current_user['user_id']
    
    ride = Ride.find_by_driver_id(driver_id)
    if not ride:
        return jsonify({"error": "You are not currently live"}), 400
    
    # Update ride status
    Ride.update_status(ride['_id'], 'completed')
    
    # Update any pending requests to cancelled
    mongo.db.ride_requests.update_many(
        {"driver_id": ObjectId(driver_id), "status": "pending"},
        {"$set": {"status": "cancelled", "updated_at": datetime.datetime.utcnow()}}
    )
    
    return jsonify({"message": "You are now offline"}), 200

@rides_bp.route('/nearby', methods=['POST'])
@token_required
@role_required('rider')
def find_nearby_rides():
    """Find nearby drivers for riders using geospatial search"""
    data = request.get_json()
    
    if 'current_location' not in data:
        return jsonify({"error": "Current location required"}), 400
    
    rider_coords = data['current_location']
    if not isinstance(rider_coords, list) or len(rider_coords) != 2:
        return jsonify({"error": "Invalid location format"}), 400
    
    # Create GeoJSON point for rider location
    rider_location = {
        "type": "Point",
        "coordinates": rider_coords
    }
    
    # Find nearby rides
    max_distance = data.get('max_distance_km', 15)
    nearby_rides = Ride.find_nearby_rides(rider_location, max_distance)
    
    # Calculate smart scores and prepare response
    rides_with_scores = []
    for ride in nearby_rides:
        driver_info = ride['driver_info']
        
        # Calculate smart score
        smart_score = calculate_smart_score(
            distance_meters=ride['distance'],
            driver_rating=driver_info.get('averageRating', 0)
        )
        
        # Calculate cost-sharing fare (rider's pickup to destination)
        rider_pickup = rider_coords
        rider_destination = data.get('destination_location', rider_coords)
        
        if rider_destination != rider_coords:
            trip_distance = calculate_haversine_distance(rider_pickup, rider_destination)
            suggested_fare = calculate_cost_sharing_fare(trip_distance)
        else:
            # Fallback to driver's route distance
            pickup_coords = ride['pickup_location']['coordinates']
            dest_coords = ride['destination_location']['coordinates']
            trip_distance = calculate_haversine_distance(pickup_coords, dest_coords)
            suggested_fare = calculate_cost_sharing_fare(trip_distance)
        
        rides_with_scores.append({
            "ride_id": str(ride['_id']),
            "driver": {
                "name": driver_info['name'],
                "rating": driver_info.get('averageRating', 0),
                "phone": "Hidden until ride accepted"  # Privacy protection
            },
            "pickup_address": ride['pickup_address'],
            "destination_address": ride['destination_address'],
            "pickup_coordinates": ride['pickup_location']['coordinates'],  # ADD THIS
            "destination_coordinates": ride['destination_location']['coordinates'],  # ADD THIS
            "distance_km": round(ride['distance'] / 1000, 2),
            "smart_score": smart_score,
            "suggested_fare": suggested_fare,
            "seats_available": ride['seats_available']
        })
    
    # Sort by smart score
    rides_with_scores.sort(key=lambda x: x['smart_score'], reverse=True)
    
    return jsonify({
        "nearby_rides": rides_with_scores,
        "total_found": len(rides_with_scores)
    }), 200

@rides_bp.route('/request', methods=['POST'])
@token_required
@role_required('rider')
def request_ride():
    """Rider requests a specific ride"""
    data = request.get_json()
    
    # Debug logging
    print(f"Received ride request data: {data}")
    print(f"Data keys: {list(data.keys()) if data else 'None'}")
    
    required_fields = ['ride_id', 'pickup_location', 'destination_location',
                      'pickup_address', 'destination_address']
    
    # Check each field individually for better debugging
    missing_fields = []
    for field in required_fields:
        if field not in data:
            missing_fields.append(field)
        else:
            print(f"Field '{field}': {data[field]}")
    
    if missing_fields:
        print(f"Missing fields: {missing_fields}")
        return jsonify({"error": f"Missing required fields: {missing_fields}"}), 400
    
    # Validate data types and values
    if not isinstance(data['pickup_location'], list) or len(data['pickup_location']) != 2:
        print(f"Invalid pickup_location format: {data['pickup_location']}")
        return jsonify({"error": "Invalid pickup_location format. Expected [longitude, latitude]"}), 400
    
    if not isinstance(data['destination_location'], list) or len(data['destination_location']) != 2:
        print(f"Invalid destination_location format: {data['destination_location']}")
        return jsonify({"error": "Invalid destination_location format. Expected [longitude, latitude]"}), 400
    
    if not data['pickup_address'] or not data['pickup_address'].strip():
        print(f"Empty pickup_address: '{data['pickup_address']}'")
        return jsonify({"error": "pickup_address cannot be empty"}), 400
    
    if not data['destination_address'] or not data['destination_address'].strip():
        print(f"Empty destination_address: '{data['destination_address']}'")
        return jsonify({"error": "destination_address cannot be empty"}), 400
    
    rider_id = request.current_user['user_id']
    
    # Validate ride exists and is active
    print(f"Looking for ride with ID: {data['ride_id']}")
    try:
        ride = mongo.db.rides.find_one({
            "_id": ObjectId(data['ride_id']),
            "status": "active"
        })
        print(f"Found ride: {ride is not None}")
        if ride:
            print(f"Ride status: {ride.get('status')}")
    except Exception as e:
        print(f"Error converting ride_id to ObjectId: {e}")
        return jsonify({"error": "Invalid ride_id format"}), 400
    
    if not ride:
        return jsonify({"error": "Ride not found or no longer available"}), 404
    
    # Check for existing requests from this rider to any driver
    existing_request = mongo.db.ride_requests.find_one({
        "rider_id": ObjectId(rider_id),
        "status": {"$in": ["pending", "accepted"]}
    })
    
    if existing_request:
        return jsonify({"error": "You already have an active ride request"}), 409
    
    # Create GeoJSON points
    pickup_geojson = {
        "type": "Point",
        "coordinates": data['pickup_location']
    }
    
    dest_geojson = {
        "type": "Point",
        "coordinates": data['destination_location']
    }
    
    # Calculate fare for this specific request
    trip_distance = calculate_haversine_distance(data['pickup_location'], data['destination_location'])
    calculated_fare = calculate_cost_sharing_fare(trip_distance)
    
    # Create ride request
    ride_request = RideRequest(
        rider_id=rider_id,
        driver_id=ride['driver_id'],
        pickup_location=pickup_geojson,
        destination_location=dest_geojson,
        pickup_address=data['pickup_address'],
        destination_address=data['destination_address'],
        estimated_fare=calculated_fare
    )
    
    result = ride_request.save()
    
    return jsonify({
        "message": "Ride requested successfully!",
        "request_id": str(result.inserted_id),
        "estimated_fare": calculated_fare
    }), 201

@rides_bp.route('/test-request', methods=['POST'])
@token_required
@role_required('rider')
def test_ride_request():
    """Test endpoint for ride request without requiring real ride ID"""
    data = request.get_json()
    
    # Generate a test OTP
    import random
    import string
    otp = ''.join(random.choices(string.digits, k=4))
    
    return jsonify({
        "message": "Test ride request successful!",
        "request_id": "test_request_123",
        "otp": otp,
        "driver_name": "Test Driver",
        "driver_phone": "+91 98765 43210",
        "estimated_duration": "15 min"
    }), 201

@rides_bp.route('/request-status/<request_id>', methods=['GET'])
@token_required
@role_required('rider')
def get_request_status(request_id):
    """Get status of a specific ride request"""
    rider_id = request.current_user['user_id']
    
    # Find the request with driver info
    pipeline = [
        {
            "$match": {
                "_id": ObjectId(request_id),
                "rider_id": ObjectId(rider_id)
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "driver_id",
                "foreignField": "_id",
                "as": "driver_info"
            }
        },
        {
            "$lookup": {
                "from": "user_profiles",
                "localField": "driver_id",
                "foreignField": "user_id",
                "as": "driver_profile"
            }
        },
        {
            "$unwind": "$driver_info"
        }
    ]
    
    request_data = list(mongo.db.ride_requests.aggregate(pipeline))
    
    if not request_data:
        return jsonify({"error": "Request not found"}), 404
    
    request_info = request_data[0]
    driver_profile = request_info.get('driver_profile', [{}])[0] if request_info.get('driver_profile') else {}
    
    response_data = {
        "request_id": request_id,
        "status": request_info['status'],
        "driver": {
            "name": request_info['driver_info']['name'],
            "phone": driver_profile.get('phone_number', 'Not available'),
            "rating": request_info['driver_info'].get('averageRating', 0)
        },
        "pickup_address": request_info['pickup_address'],
        "destination_address": request_info['destination_address'],
        "estimated_fare": request_info.get('estimated_fare', 0),
        "created_at": request_info['created_at'].isoformat(),
        "updated_at": request_info.get('updated_at', request_info['created_at']).isoformat()
    }
    
    # FIXED: Status-specific messages and OTP handling
    if request_info['status'] == 'accepted' and 'otp' in request_info:
        response_data['otp'] = request_info['otp']
        response_data['message'] = f"Driver accepted! Share OTP {request_info['otp']} with your driver."
    elif request_info['status'] == 'rejected':
        response_data['message'] = "Your ride request was declined. Try requesting another ride."
    elif request_info['status'] == 'pending':
        response_data['message'] = "Waiting for driver response..."
    elif request_info['status'] == 'started':
        response_data['otp'] = request_info.get('otp')  # Keep OTP for reference
        response_data['message'] = "Your ride has started! Enjoy your trip."
    elif request_info['status'] == 'completed':
        response_data['message'] = "Ride completed successfully!"
    
    return jsonify(response_data), 200


@rides_bp.route('/cancel-request/<request_id>', methods=['POST'])
@token_required
@role_required('rider')
def cancel_ride_request(request_id):
    """Cancel ride request"""
    rider_id = request.current_user['user_id']
    
    result = mongo.db.ride_requests.update_one(
        {"_id": ObjectId(request_id), "rider_id": ObjectId(rider_id), 
         "status": {"$in": ["pending", "accepted"]}},
        {"$set": {"status": "cancelled", "updated_at": datetime.datetime.utcnow()}}
    )
    
    if result.modified_count > 0:
        return jsonify({"message": "Ride cancelled successfully"}), 200
    else:
        return jsonify({"error": "Cannot cancel ride"}), 400
    

@rides_bp.route('/my-requests', methods=['GET'])
@token_required
@role_required('rider')
def get_my_requests():
    """Get all ride requests for the logged-in rider"""
    rider_id = request.current_user['user_id']
    
    pipeline = [
        {
            "$match": {
                "rider_id": ObjectId(rider_id)
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "driver_id",
                "foreignField": "_id",
                "as": "driver_info"
            }
        },
        {
            "$unwind": "$driver_info"
        },
        {
            "$sort": {"created_at": -1}
        }
    ]
    
    requests = list(mongo.db.ride_requests.aggregate(pipeline))
    
    formatted_requests = []
    for req in requests:
        formatted_requests.append({
            "request_id": str(req['_id']),
            "status": req['status'],
            "driver_name": req['driver_info']['name'],
            "pickup_address": req['pickup_address'],
            "destination_address": req['destination_address'],
            "estimated_fare": req.get('estimated_fare', 0),
            "created_at": req['created_at'].strftime("%Y-%m-%d %H:%M"),
            "otp": req.get('otp') if req['status'] == 'accepted' else None
        })
    
    return jsonify({
        "requests": formatted_requests,
        "total": len(formatted_requests)
    }), 200

@rides_bp.route('/requests', methods=['GET'])
@token_required
@role_required('driver')
def get_ride_requests():
    """Get all pending ride requests for the driver"""
    driver_id = request.current_user['user_id']
    
    # Find requests with rider information
    pipeline = [
        {
            "$match": {
                "driver_id": ObjectId(driver_id),
                "status": "pending"
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "rider_id", 
                "foreignField": "_id",
                "as": "rider_info"
            }
        },
        {
            "$lookup": {
                "from": "user_profiles",
                "localField": "rider_id",
                "foreignField": "user_id", 
                "as": "rider_profile"
            }
        },
        {
            "$unwind": "$rider_info"
        },
        {
            "$sort": {"created_at": -1}
        }
    ]
    
    requests = list(mongo.db.ride_requests.aggregate(pipeline))
    
    formatted_requests = []
    for req in requests:
        rider_profile = req.get('rider_profile', [{}])[0] if req.get('rider_profile') else {}
        
        formatted_requests.append({
            "request_id": str(req['_id']),
            "rider": {
                "name": req['rider_info']['name'],
                "phone": rider_profile.get('phone_number', 'Not available'),
                "rating": req['rider_info'].get('averageRating', 0)
            },
            "pickup_address": req['pickup_address'],
            "destination_address": req['destination_address'],
            "estimated_fare": req.get('estimated_fare', 0),
            "requested_at": req['created_at'].strftime("%Y-%m-%d %H:%M")
        })
    
    return jsonify({
        "requests": formatted_requests,
        "total": len(formatted_requests)
    }), 200

@rides_bp.route('/requests/<request_id>/respond', methods=['POST'])
@token_required
@role_required('driver')
def respond_to_request(request_id):
    """Driver accepts or rejects a ride request"""
    data = request.get_json()
    
    if 'action' not in data or data['action'] not in ['accept', 'reject']:
        return jsonify({"error": "Invalid action. Use 'accept' or 'reject'"}), 400
    
    # Find the request
    ride_request = RideRequest.find_by_id(request_id)
    if not ride_request:
        return jsonify({"error": "Request not found"}), 404
    
    # Verify it's for this driver
    driver_id = request.current_user['user_id']
    if str(ride_request['driver_id']) != driver_id:
        return jsonify({"error": "Unauthorized"}), 403
    
    if ride_request['status'] != 'pending':
        return jsonify({"error": "Request is no longer pending"}), 400
    
    if data['action'] == 'accept':
        # Generate 4-digit OTP
        otp = ''.join(random.choices(string.digits, k=4))
        RideRequest.update_status(request_id, 'accepted', otp)
        
        # Reject all other pending requests for this rider
        mongo.db.ride_requests.update_many(
            {
                "rider_id": ride_request['rider_id'],
                "status": "pending",
                "_id": {"$ne": ObjectId(request_id)}
            },
            {
                "$set": {
                    "status": "cancelled",
                    "updated_at": datetime.datetime.utcnow()
                }
            }
        )
        
        return jsonify({
            "message": "Ride request accepted!",
            "otp": otp,
            "note": "Share this OTP with the rider to start the trip",
            "rider_phone": ride_request.get('rider_phone', 'Not available')
        }), 200
    else:
        RideRequest.update_status(request_id, 'rejected')
        return jsonify({"message": "Ride request rejected"}), 200

@rides_bp.route('/verify-otp', methods=['POST'])
@token_required
@role_required('driver')
def verify_otp():
    """Verify OTP and start the ride"""
    data = request.get_json()
    
    required_fields = ['request_id', 'otp']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    driver_id = request.current_user['user_id']
    
    # Find the accepted request
    ride_request = mongo.db.ride_requests.find_one({
        "_id": ObjectId(data['request_id']),
        "driver_id": ObjectId(driver_id),
        "status": "accepted"
    })
    
    if not ride_request:
        return jsonify({"error": "Request not found or not accepted"}), 404
    
    # Verify OTP
    if ride_request.get('otp') != data['otp']:
        return jsonify({"error": "Invalid OTP"}), 400
    
    # Update request status to started
    RideRequest.update_status(data['request_id'], 'started')
    
    return jsonify({
        "message": "OTP verified! Ride has started.",
        "status": "started"
    }), 200

@rides_bp.route('/complete-ride', methods=['POST'])
@token_required
@role_required('driver')
def complete_ride():
    """Complete the active ride"""
    data = request.get_json()
    
    if 'request_id' not in data:
        return jsonify({"error": "Request ID required"}), 400
    
    driver_id = request.current_user['user_id']
    
    # Find the active request
    ride_request = mongo.db.ride_requests.find_one({
        "_id": ObjectId(data['request_id']),
        "driver_id": ObjectId(driver_id),
        "status": "started"
    })
    
    if not ride_request:
        return jsonify({"error": "Active ride not found"}), 404
    
    # Update request status to completed
    RideRequest.update_status(data['request_id'], 'completed')
    
    # Update both rider and driver ratings if provided
    rating_data = data.get('ratings', {})
    if rating_data.get('rider_rating'):
        User.update_rating(ride_request['rider_id'], rating_data['rider_rating'])
    
    return jsonify({
        "message": "Ride completed successfully!",
        "final_fare": ride_request.get('estimated_fare', 0)
    }), 200

@rides_bp.route('/fare-estimate', methods=['POST'])
@token_required
def estimate_fare():
    """Calculate fare estimate using cost-sharing model"""
    data = request.get_json()
    
    required_fields = ['pickup_location', 'destination_location']
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing pickup or destination location"}), 400
    
    pickup_coords = data['pickup_location']
    dest_coords = data['destination_location']
    
    # Calculate distance
    distance_km = calculate_haversine_distance(pickup_coords, dest_coords)
    
    # Cost-sharing fare calculation
    estimated_fare = calculate_cost_sharing_fare(distance_km)
    
    return jsonify({
        "distance_km": round(distance_km, 2),
        "estimated_fare": estimated_fare,
        "fare_breakdown": {
            "base_fare": 15,
            "cost_sharing_rate": "₹5-8 per km",
            "total_distance": round(distance_km, 2),
            "note": "Cost-effective shared ride pricing"
        }
    }), 200

@rides_bp.route('/active-ride', methods=['GET'])
@token_required
def get_active_ride():
    """Get active ride information for both rider and driver"""
    user_id = request.current_user['user_id']
    user_role = request.current_user['role']
    
    if user_role == 'driver':
        # Find active ride as driver
        active_request = mongo.db.ride_requests.find_one({
            "driver_id": ObjectId(user_id),
            "status": {"$in": ["accepted", "started"]}
        })
        
        if active_request:
            # Get rider info
            rider_info = mongo.db.users.find_one({"_id": active_request['rider_id']})
            rider_profile = mongo.db.user_profiles.find_one({"user_id": active_request['rider_id']})
            
            return jsonify({
                "has_active_ride": True,
                "ride_info": {
                    "request_id": str(active_request['_id']),
                    "status": active_request['status'],
                    "rider": {
                        "name": rider_info['name'],
                        "phone": rider_profile.get('phone_number', 'Not available') if rider_profile else 'Not available'
                    },
                    "pickup_address": active_request['pickup_address'],
                    "destination_address": active_request['destination_address'],
                    "estimated_fare": active_request.get('estimated_fare', 0),
                    "otp": active_request.get('otp') if active_request['status'] == 'accepted' else None
                }
            }), 200
    else:
        # Find active ride as rider
        active_request = mongo.db.ride_requests.find_one({
            "rider_id": ObjectId(user_id),
            "status": {"$in": ["pending", "accepted", "started"]}
        })
        
        if active_request:
            # Get driver info
            driver_info = mongo.db.users.find_one({"_id": active_request['driver_id']})
            driver_profile = mongo.db.user_profiles.find_one({"user_id": active_request['driver_id']})
            
            return jsonify({
                "has_active_ride": True,
                "ride_info": {
                    "request_id": str(active_request['_id']),
                    "status": active_request['status'],
                    "driver": {
                        "name": driver_info['name'],
                        "phone": "Hidden until ride accepted",  # Privacy protection
                        "rating": driver_info.get('averageRating', 0)
                    },
                    "pickup_address": active_request['pickup_address'],
                    "destination_address": active_request['destination_address'],
                    "estimated_fare": active_request.get('estimated_fare', 0),
                    "otp": active_request.get('otp') if active_request['status'] == 'accepted' else None,
                    "created_at": active_request['created_at'].isoformat()
                }
            }), 200
    
    return jsonify({"has_active_ride": False}), 200

@rides_bp.route('/update-location', methods=['POST'])
@token_required
@role_required('driver')
def update_driver_location():
    """Update driver's current location during active ride"""
    data = request.get_json()
    
    if 'current_location' not in data:
        return jsonify({"error": "Current location required"}), 400
    
    current_coords = data['current_location']
    if not isinstance(current_coords, list) or len(current_coords) != 2:
        return jsonify({"error": "Invalid location format"}), 400
    
    driver_id = request.current_user['user_id']
    
    # Update active ride with current location
    result = mongo.db.rides.update_one(
        {"driver_id": ObjectId(driver_id), "status": "active"},
        {
            "$set": {
                "current_location": {
                    "type": "Point",
                    "coordinates": current_coords
                },
                "location_updated_at": datetime.datetime.utcnow()
            }
        }
    )
    
    if result.matched_count == 0:
        return jsonify({"error": "No active ride found"}), 404
    
    return jsonify({"message": "Location updated successfully"}), 200

@rides_bp.route('/driver-location/<request_id>', methods=['GET'])
@token_required
@role_required('rider')
def get_driver_location(request_id):
    """Get driver's current location for active ride"""
    rider_id = request.current_user['user_id']
    
    # Find request and get driver's current location
    request_data = mongo.db.ride_requests.find_one({
        "_id": ObjectId(request_id),
        "rider_id": ObjectId(rider_id),
        "status": {"$in": ["accepted", "started"]}
    })
    
    if not request_data:
        return jsonify({"error": "Active ride not found"}), 404
    
    # Get driver's current location from rides collection
    driver_ride = mongo.db.rides.find_one({
        "driver_id": request_data['driver_id'],
        "status": "active"
    })
    
    response_data = {"status": request_data['status']}
    
    if driver_ride and 'current_location' in driver_ride:
        response_data['driver_location'] = driver_ride['current_location']['coordinates']
        response_data['location_updated_at'] = driver_ride.get('location_updated_at')
    
    return jsonify(response_data), 200

@rides_bp.route('/share-rider-location', methods=['POST'])
@token_required
@role_required('rider')
def share_rider_location():
    """Share rider's current location with driver during active ride"""
    data = request.get_json()
    
    if 'request_id' not in data or 'current_location' not in data:
        return jsonify({"error": "request_id and current_location required"}), 400
    
    current_coords = data['current_location']
    if not isinstance(current_coords, list) or len(current_coords) != 2:
        return jsonify({"error": "Invalid location format"}), 400
    
    rider_id = request.current_user['user_id']
    
    # Find the active ride request
    ride_request = mongo.db.ride_requests.find_one({
        "_id": ObjectId(data['request_id']),
        "rider_id": ObjectId(rider_id),
        "status": {"$in": ["accepted", "started"]}
    })
    
    if not ride_request:
        return jsonify({"error": "Active ride not found"}), 404
    
    # Update rider location in the ride request
    result = mongo.db.ride_requests.update_one(
        {"_id": ObjectId(data['request_id'])},
        {
            "$set": {
                "rider_current_location": {
                    "type": "Point",
                    "coordinates": current_coords
                },
                "rider_location_updated_at": datetime.datetime.utcnow()
            }
        }
    )
    
    if result.matched_count == 0:
        return jsonify({"error": "Failed to update location"}), 500
    
    return jsonify({"message": "Location shared successfully"}), 200


# ===============================
# PRE-BOOKING ENDPOINTS (PHASE 3)
# ===============================

@rides_bp.route('/prebook/request', methods=['POST'])
@token_required
@role_required('rider')
def create_prebook_request():
    """Rider creates a future ride request"""
    data = request.get_json()
    
    required_fields = ['pickup_location', 'destination_location', 
                      'pickup_address', 'destination_address', 'requested_datetime']
    
    if not all(field in data for field in required_fields):
        return jsonify({"error": "Missing required fields"}), 400
    
    rider_id = request.current_user['user_id']
    
    # Parse requested datetime
    try:
        requested_dt = datetime.datetime.fromisoformat(data['requested_datetime'].replace('Z', '+00:00'))
    except:
        return jsonify({"error": "Invalid datetime format. Use ISO format."}), 400
    
    # Validate future datetime
    if requested_dt <= datetime.datetime.now(datetime.timezone.utc):
        return jsonify({"error": "Requested time must be in the future"}), 400
    
    # Check if rider already has active pre-booking for similar time
    existing = mongo.db.prebook_requests.find_one({
        "rider_id": ObjectId(rider_id),
        "status": "open",
        "requested_datetime": {
            "$gte": requested_dt - datetime.timedelta(hours=2),
            "$lte": requested_dt + datetime.timedelta(hours=2)
        }
    })
    
    if existing:
        return jsonify({"error": "You already have a pending request for a similar time"}), 409
    
    # Create GeoJSON points
    pickup_geojson = {
        "type": "Point",
        "coordinates": data['pickup_location']
    }
    
    dest_geojson = {
        "type": "Point",
        "coordinates": data['destination_location']
    }
    
    # Calculate estimated fare
    trip_distance = calculate_haversine_distance(data['pickup_location'], data['destination_location'])
    estimated_fare = calculate_cost_sharing_fare(trip_distance)
    
    # Create pre-booking request
    prebook_request = PreBookRequest(
        rider_id=rider_id,
        pickup_location=pickup_geojson,
        destination_location=dest_geojson,
        pickup_address=data['pickup_address'],
        destination_address=data['destination_address'],
        requested_datetime=requested_dt,
        max_fare=data.get('max_fare'),
        notes=data.get('notes', '')
    )
    
    # Save estimated fare
    prebook_request.estimated_fare = estimated_fare
    
    result = prebook_request.save()
    
    return jsonify({
        "message": "Pre-booking request created successfully!",
        "request_id": str(result.inserted_id),
        "estimated_fare": estimated_fare,
        "requested_datetime": requested_dt.isoformat()
    }), 201

@rides_bp.route('/prebook/nearby', methods=['POST'])
@token_required
@role_required('driver')
def find_nearby_prebook_requests():
    """Driver finds nearby pre-booking requests"""
    data = request.get_json()
    
    if 'driver_location' not in data:
        return jsonify({"error": "Driver location required"}), 400
    
    driver_coords = data['driver_location']
    if not isinstance(driver_coords, list) or len(driver_coords) != 2:
        return jsonify({"error": "Invalid location format"}), 400
    
    # Create GeoJSON point for driver location
    driver_location = {
        "type": "Point",
        "coordinates": driver_coords
    }
    
    # Find nearby requests (based on rider's home location)
    max_distance = data.get('max_distance_km', 25)
    nearby_requests = PreBookRequest.find_nearby_requests(driver_location, max_distance)
    
    # Format response
    formatted_requests = []
    for req in nearby_requests:
        rider_info = req['rider_info']
        rider_profile = req.get('rider_profile', [{}])[0] if req.get('rider_profile') else {}
        
        # Calculate time until ride
        time_until = req['requested_datetime'] - datetime.datetime.utcnow()
        hours_until = int(time_until.total_seconds() / 3600)
        
        # Calculate smart score for pre-booking (time + distance + rating)
        distance_score = max(0, 100 - (req['distance_to_rider_home'] / 1000) * 5)  # Distance component
        time_score = max(0, min(50, hours_until * 2))  # Time component (more points for sooner rides)
        rating_score = rider_info.get('averageRating', 0) * 10  # Rating component
        
        smart_score = min(100, distance_score + time_score + rating_score)
        
        formatted_requests.append({
            "request_id": str(req['_id']),
            "rider": {
                "name": rider_info['name'],
                "rating": rider_info.get('averageRating', 0),
                "home_distance_km": round(req['distance_to_rider_home'] / 1000, 2)
            },
            "pickup_address": req['pickup_address'],
            "destination_address": req['destination_address'],
            "pickup_coordinates": req['pickup_location']['coordinates'],
            "destination_coordinates": req['destination_location']['coordinates'],
            "requested_datetime": req['requested_datetime'].isoformat(),
            "time_until_ride": f"{hours_until}h {int((time_until.total_seconds() % 3600) / 60)}m",
            "estimated_fare": req.get('estimated_fare', 0),
            "max_fare": req.get('max_fare'),
            "notes": req.get('notes', ''),
            "smart_score": round(smart_score),
            "created_at": req['created_at'].isoformat()
        })
    
    # Sort by smart score (highest first)
    formatted_requests.sort(key=lambda x: x['smart_score'], reverse=True)
    
    return jsonify({
        "prebook_requests": formatted_requests,
        "total_found": len(formatted_requests)
    }), 200

@rides_bp.route('/prebook/accept/<request_id>', methods=['POST'])
@token_required
@role_required('driver')
def accept_prebook_request(request_id):
    """Driver accepts a pre-booking request"""
    driver_id = request.current_user['user_id']
    
    # Find the request
    prebook_req = mongo.db.prebook_requests.find_one({
        "_id": ObjectId(request_id),
        "status": "open"
    })
    
    if not prebook_req:
        return jsonify({"error": "Request not found or no longer available"}), 404
    
    # Check if driver already accepted this time slot
    conflict_check = mongo.db.prebook_requests.find_one({
        "matched_driver_id": ObjectId(driver_id),
        "status": "matched",
        "requested_datetime": {
            "$gte": prebook_req['requested_datetime'] - datetime.timedelta(hours=1),
            "$lte": prebook_req['requested_datetime'] + datetime.timedelta(hours=1)
        }
    })
    
    if conflict_check:
        return jsonify({"error": "You already have a ride scheduled for this time"}), 409
    
    # Update request status
    PreBookRequest.update_status(request_id, "matched", driver_id)
    
    # Get rider info for response
    rider_info = mongo.db.users.find_one({"_id": prebook_req['rider_id']})
    rider_profile = mongo.db.user_profiles.find_one({"user_id": prebook_req['rider_id']})
    
    return jsonify({
        "message": "Pre-booking request accepted!",
        "ride_datetime": prebook_req['requested_datetime'].isoformat(),
        "rider": {
            "name": rider_info.get('name', 'Unknown'),
            "phone": rider_profile.get('phone_number', 'Not available') if rider_profile else 'Not available'
        },
        "pickup_address": prebook_req['pickup_address'],
        "destination_address": prebook_req['destination_address'],
        "estimated_fare": prebook_req.get('estimated_fare', 0)
    }), 200

@rides_bp.route('/prebook/my-requests', methods=['GET'])
@token_required
@role_required('rider')
def get_my_prebook_requests():
    """Get rider's pre-booking requests"""
    rider_id = request.current_user['user_id']
    
    # Get requests with driver info (if matched)
    pipeline = [
        {
            "$match": {"rider_id": ObjectId(rider_id)}
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "matched_driver_id",
                "foreignField": "_id",
                "as": "driver_info"
            }
        },
        {
            "$lookup": {
                "from": "user_profiles",
                "localField": "matched_driver_id",
                "foreignField": "user_id",
                "as": "driver_profile"
            }
        },
        {
            "$sort": {"requested_datetime": 1}
        }
    ]
    
    requests = list(mongo.db.prebook_requests.aggregate(pipeline))
    
    formatted_requests = []
    for req in requests:
        driver_info = req.get('driver_info', [{}])[0] if req.get('driver_info') else None
        driver_profile = req.get('driver_profile', [{}])[0] if req.get('driver_profile') else {}
        
        request_data = {
            "request_id": str(req['_id']),
            "status": req['status'],
            "pickup_address": req['pickup_address'],
            "destination_address": req['destination_address'],
            "requested_datetime": req['requested_datetime'].isoformat(),
            "estimated_fare": req.get('estimated_fare', 0),
            "max_fare": req.get('max_fare'),
            "notes": req.get('notes', ''),
            "created_at": req['created_at'].isoformat()
        }
        
        if driver_info:
            request_data['driver'] = {
                "name": driver_info.get('name', 'Unknown'),
                "phone": driver_profile.get('phone_number', 'Not available'),
                "rating": driver_info.get('averageRating', 0)
            }
        
        formatted_requests.append(request_data)
    
    return jsonify({
        "prebook_requests": formatted_requests,
        "total": len(formatted_requests)
    }), 200

@rides_bp.route('/prebook/my-accepted', methods=['GET'])
@token_required
@role_required('driver')
def get_my_accepted_prebooks():
    """Get driver's accepted pre-bookings"""
    driver_id = request.current_user['user_id']
    
    # Get accepted requests with rider info
    pipeline = [
        {
            "$match": {
                "matched_driver_id": ObjectId(driver_id),
                "status": "matched"
            }
        },
        {
            "$lookup": {
                "from": "users",
                "localField": "rider_id",
                "foreignField": "_id",
                "as": "rider_info"
            }
        },
        {
            "$lookup": {
                "from": "user_profiles",
                "localField": "rider_id",
                "foreignField": "user_id",
                "as": "rider_profile"
            }
        },
        {
            "$unwind": "$rider_info"
        },
        {
            "$sort": {"requested_datetime": 1}
        }
    ]
    
    requests = list(mongo.db.prebook_requests.aggregate(pipeline))
    
    formatted_requests = []
    for req in requests:
        rider_profile = req.get('rider_profile', [{}])[0] if req.get('rider_profile') else {}
        
        formatted_requests.append({
            "request_id": str(req['_id']),
            "rider": {
                "name": req['rider_info']['name'],
                "phone": rider_profile.get('phone_number', 'Not available'),
                "rating": req['rider_info'].get('averageRating', 0)
            },
            "pickup_address": req['pickup_address'],
            "destination_address": req['destination_address'],
            "requested_datetime": req['requested_datetime'].isoformat(),
            "estimated_fare": req.get('estimated_fare', 0),
            "notes": req.get('notes', ''),
            "accepted_at": req.get('updated_at', req['created_at']).isoformat()
        })
    
    return jsonify({
        "accepted_prebooks": formatted_requests,
        "total": len(formatted_requests)
    }), 200

@rides_bp.route('/prebook/cancel/<request_id>', methods=['POST'])
@token_required
def cancel_prebook_request(request_id):
    """Cancel a pre-booking request (rider or driver)"""
    user_id = request.current_user['user_id']
    user_role = request.current_user['role']
    
    # Find the request
    if user_role == 'rider':
        prebook_req = mongo.db.prebook_requests.find_one({
            "_id": ObjectId(request_id),
            "rider_id": ObjectId(user_id)
        })
    else:  # driver
        prebook_req = mongo.db.prebook_requests.find_one({
            "_id": ObjectId(request_id),
            "matched_driver_id": ObjectId(user_id)
        })
    
    if not prebook_req:
        return jsonify({"error": "Request not found"}), 404
    
    if prebook_req['status'] not in ['open', 'matched']:
        return jsonify({"error": "Cannot cancel this request"}), 400
    
    # Update status
    if user_role == 'rider':
        PreBookRequest.update_status(request_id, "cancelled")
    else:  # driver cancelling - reset to open
        mongo.db.prebook_requests.update_one(
            {"_id": ObjectId(request_id)},
            {
                "$set": {
                    "status": "open",
                    "updated_at": datetime.datetime.utcnow()
                },
                "$unset": {"matched_driver_id": ""}
            }
        )
    
    return jsonify({"message": "Pre-booking request cancelled successfully"}), 200

