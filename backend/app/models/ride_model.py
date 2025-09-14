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
    def find_nearby_rides(rider_location, max_distance_km=10):
        """
        Find nearby active rides using MongoDB's geospatial query.
        This is the "magic radar" that finds drivers near a rider.
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
                "$unwind": "$driver_info"  # Convert array to object
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

class RideRequest:
    """
    The RideRequest model for when riders request rides from drivers.
    """
    def __init__(self, rider_id, driver_id, pickup_location, destination_location,
                 pickup_address, destination_address):
        self.rider_id = ObjectId(rider_id)
        self.driver_id = ObjectId(driver_id)
        self.pickup_location = pickup_location
        self.destination_location = destination_location
        self.pickup_address = pickup_address
        self.destination_address = destination_address
        self.status = "pending"  # pending, accepted, rejected, completed
        self.created_at = datetime.datetime.utcnow()
        self.otp = None  # Will be generated when accepted
        
    def save(self):
        """Save ride request to database"""
        request_data = self.__dict__.copy()
        return mongo.db.ride_requests.insert_one(request_data)
    
    @staticmethod
    def find_by_driver_id(driver_id):
        """Find all ride requests for a specific driver"""
        return list(mongo.db.ride_requests.find({
            "driver_id": ObjectId(driver_id),
            "status": "pending"
        }))
    
    @staticmethod
    def find_by_id(request_id):
        """Find ride request by ID"""
        return mongo.db.ride_requests.find_one({"_id": ObjectId(request_id)})
    
    @staticmethod
    def update_status(request_id, new_status, otp=None):
        """Update ride request status"""
        update_data = {
            "status": new_status,
            "updated_at": datetime.datetime.utcnow()
        }
        if otp:
            update_data["otp"] = otp
            
        return mongo.db.ride_requests.update_one(
            {"_id": ObjectId(request_id)},
            {"$set": update_data}
        )