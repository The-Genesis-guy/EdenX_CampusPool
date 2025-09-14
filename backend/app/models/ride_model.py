from flask import current_app
from bson.objectid import ObjectId
import datetime
from .. import mongo

class Ride:
    """
    The Ride model for handling active rides and ride requests.
    This represents when a driver "goes live" and is available for rides.
    """
    def __init__(self, driver_id, pickup_location, destination_location, 
                 pickup_address, destination_address, seats_available=1):
        self.driver_id = ObjectId(driver_id)
        self.pickup_location = pickup_location  # GeoJSON Point
        self.destination_location = destination_location  # GeoJSON Point
        self.pickup_address = pickup_address  # Human readable address
        self.destination_address = destination_address  # Human readable address
        self.seats_available = seats_available
        self.status = "active"  # active, completed, cancelled
        self.created_at = datetime.datetime.utcnow()
        self.updated_at = datetime.datetime.utcnow()
        
    def save(self):
        """Save the ride to database"""
        ride_data = self.__dict__.copy()
        return mongo.db.rides.insert_one(ride_data)
    
    @staticmethod
    def find_nearby_rides(rider_location, max_distance_km=15):
        """
        Find nearby active rides using MongoDB's geospatial query.
        Enhanced with better driver information and availability checking.
        """
        pipeline = [
            {
                "$geoNear": {
                    "near": rider_location,  # Rider's current location
                    "distanceField": "distance",  # Add distance to results
                    "maxDistance": max_distance_km * 1000,  # Convert km to meters
                    "spherical": True,  # Use spherical geometry (Earth is round!)
                    "query": {"status": "active"}  # Only active rides
                }
            },
            {
                "$lookup": {  # Join with users collection to get driver details
                    "from": "users",
                    "localField": "driver_id",
                    "foreignField": "_id",
                    "as": "driver_info"
                }
            },
            {
                "$lookup": {  # Join with user_profiles for additional driver info
                    "from": "user_profiles",
                    "localField": "driver_id",
                    "foreignField": "user_id",
                    "as": "driver_profile"
                }
            },
            {
                "$unwind": "$driver_info"  # Convert array to object
            },
            {
                "$addFields": {
                    "driver_info.phone_number": {
                        "$arrayElemAt": ["$driver_profile.phone_number", 0]
                    }
                }
            }
        ]
        
        return list(mongo.db.rides.aggregate(pipeline))
    
    @staticmethod
    def find_by_driver_id(driver_id):
        """Find active ride by driver ID"""
        return mongo.db.rides.find_one({
            "driver_id": ObjectId(driver_id),
            "status": "active"
        })
    
    @staticmethod
    def update_status(ride_id, new_status):
        """Update ride status"""
        return mongo.db.rides.update_one(
            {"_id": ObjectId(ride_id)},
            {
                "$set": {
                    "status": new_status,
                    "updated_at": datetime.datetime.utcnow()
                }
            }
        )
    
    @staticmethod
    def get_driver_current_ride(driver_id):
        """Get driver's current active ride with full details"""
        pipeline = [
            {
                "$match": {
                    "driver_id": ObjectId(driver_id),
                    "status": "active"
                }
            },
            {
                "$lookup": {
                    "from": "ride_requests",
                    "let": {"driver_id": "$driver_id"},
                    "pipeline": [
                        {
                            "$match": {
                                "$expr": {"$eq": ["$driver_id", "$$driver_id"]},
                                "status": {"$in": ["accepted", "started"]}
                            }
                        }
                    ],
                    "as": "active_requests"
                }
            }
        ]
        
        result = list(mongo.db.rides.aggregate(pipeline))
        return result[0] if result else None

class RideRequest:
    """
    Enhanced RideRequest model for when riders request rides from drivers.
    """
    def __init__(self, rider_id, driver_id, pickup_location, destination_location,
                 pickup_address, destination_address, estimated_fare=0):
        self.rider_id = ObjectId(rider_id)
        self.driver_id = ObjectId(driver_id)
        self.pickup_location = pickup_location
        self.destination_location = destination_location
        self.pickup_address = pickup_address
        self.destination_address = destination_address
        self.estimated_fare = estimated_fare
        self.status = "pending"  # pending, accepted, rejected, started, completed, cancelled
        self.created_at = datetime.datetime.utcnow()
        self.updated_at = datetime.datetime.utcnow()
        self.otp = None  # Will be generated when accepted
        self.started_at = None  # When ride actually starts
        self.completed_at = None  # When ride is completed
        
    def save(self):
        """Save ride request to database"""
        request_data = self.__dict__.copy()
        return mongo.db.ride_requests.insert_one(request_data)
    
    @staticmethod
    def find_by_driver_id(driver_id, status_filter=None):
        """Find ride requests for a specific driver"""
        query = {"driver_id": ObjectId(driver_id)}
        if status_filter:
            if isinstance(status_filter, list):
                query["status"] = {"$in": status_filter}
            else:
                query["status"] = status_filter
        
        return list(mongo.db.ride_requests.find(query).sort("created_at", -1))
    
    @staticmethod
    def find_by_rider_id(rider_id, status_filter=None):
        """Find ride requests for a specific rider"""
        query = {"rider_id": ObjectId(rider_id)}
        if status_filter:
            if isinstance(status_filter, list):
                query["status"] = {"$in": status_filter}
            else:
                query["status"] = status_filter
        
        return list(mongo.db.ride_requests.find(query).sort("created_at", -1))
    
    @staticmethod
    def find_by_id(request_id):
        """Find ride request by ID"""
        return mongo.db.ride_requests.find_one({"_id": ObjectId(request_id)})
    
    @staticmethod
    def update_status(request_id, new_status, otp=None):
        """Update ride request status with optional OTP and timestamps"""
        update_data = {
            "status": new_status,
            "updated_at": datetime.datetime.utcnow()
        }
        
        if otp:
            update_data["otp"] = otp
        
        if new_status == "started":
            update_data["started_at"] = datetime.datetime.utcnow()
        elif new_status == "completed":
            update_data["completed_at"] = datetime.datetime.utcnow()
            
        return mongo.db.ride_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": update_data}
        )
    
    @staticmethod
    def get_active_request_for_rider(rider_id):
        """Get any active request for a rider (pending, accepted, or started)"""
        return mongo.db.ride_requests.find_one({
            "rider_id": ObjectId(rider_id),
            "status": {"$in": ["pending", "accepted", "started"]}
        })
    
    @staticmethod
    def get_active_request_for_driver(driver_id):
        """Get any active request for a driver (accepted or started)"""
        return mongo.db.ride_requests.find_one({
            "driver_id": ObjectId(driver_id),
            "status": {"$in": ["accepted", "started"]}
        })
    
    @staticmethod
    def cancel_pending_requests_for_rider(rider_id, exclude_request_id=None):
        """Cancel all pending requests for a rider, optionally excluding one"""
        query = {
            "rider_id": ObjectId(rider_id),
            "status": "pending"
        }
        
        if exclude_request_id:
            query["_id"] = {"$ne": ObjectId(exclude_request_id)}
        
        return mongo.db.ride_requests.update_many(
            query,
            {
                "$set": {
                    "status": "cancelled",
                    "updated_at": datetime.datetime.utcnow()
                }
            }
        )
    
    @staticmethod
    def get_request_with_user_details(request_id):
        """Get request with full rider and driver details"""
        pipeline = [
            {
                "$match": {"_id": ObjectId(request_id)}
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
                    "from": "users",
                    "localField": "driver_id",
                    "foreignField": "_id",
                    "as": "driver_info"
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
                "$lookup": {
                    "from": "user_profiles",
                    "localField": "driver_id",
                    "foreignField": "user_id",
                    "as": "driver_profile"
                }
            },
            {
                "$unwind": "$rider_info"
            },
            {
                "$unwind": "$driver_info"
            }
        ]
        
        result = list(mongo.db.ride_requests.aggregate(pipeline))
        return result[0] if result else None

class RideHistory:
    """Model for storing completed ride history and analytics"""
    
    @staticmethod
    def create_history_record(request_id):
        """Create a history record when ride is completed"""
        request_data = RideRequest.get_request_with_user_details(request_id)
        if not request_data:
            return None
        
        history_record = {
            "request_id": ObjectId(request_id),
            "rider_id": request_data["rider_id"],
            "driver_id": request_data["driver_id"],
            "pickup_address": request_data["pickup_address"],
            "destination_address": request_data["destination_address"],
            "final_fare": request_data.get("estimated_fare", 0),
            "distance_km": request_data.get("distance_km", 0),
            "started_at": request_data.get("started_at"),
            "completed_at": request_data.get("completed_at"),
            "total_duration": None,  # Calculate if both timestamps exist
            "rider_rating": None,  # To be updated when ratings are submitted
            "driver_rating": None,
            "created_at": datetime.datetime.utcnow()
        }
        
        # Calculate duration if both timestamps exist
        if request_data.get("started_at") and request_data.get("completed_at"):
            duration = request_data["completed_at"] - request_data["started_at"]
            history_record["total_duration"] = duration.total_seconds() / 60  # Duration in minutes
        
        return mongo.db.ride_history.insert_one(history_record)
    
    @staticmethod
    def get_user_ride_history(user_id, role="rider", limit=10):
        """Get ride history for a user (either as rider or driver)"""
        field_name = f"{role}_id"
        
        pipeline = [
            {
                "$match": {field_name: ObjectId(user_id)}
            },
            {
                "$lookup": {
                    "from": "users",
                    "localField": "rider_id" if role == "driver" else "driver_id",
                    "foreignField": "_id",
                    "as": "other_user"
                }
            },
            {
                "$unwind": "$other_user"
            },
            {
                "$sort": {"completed_at": -1}
            },
            {
                "$limit": limit
            }
        ]
        
        return list(mongo.db.ride_history.aggregate(pipeline))
    
    @staticmethod
    def get_ride_statistics(user_id, role="rider"):
        """Get ride statistics for a user"""
        field_name = f"{role}_id"
        
        pipeline = [
            {
                "$match": {field_name: ObjectId(user_id)}
            },
            {
                "$group": {
                    "_id": None,
                    "total_rides": {"$sum": 1},
                    "total_fare": {"$sum": "$final_fare"},
                    "avg_fare": {"$avg": "$final_fare"},
                    "total_distance": {"$sum": "$distance_km"},
                    "avg_rating": {"$avg": f"${role}_rating"}
                }
            }
        ]
        
        result = list(mongo.db.ride_history.aggregate(pipeline))
        return result[0] if result else {
            "total_rides": 0,
            "total_fare": 0,
            "avg_fare": 0,
            "total_distance": 0,
            "avg_rating": 0
        }