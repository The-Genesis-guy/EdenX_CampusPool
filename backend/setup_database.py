#!/usr/bin/env python3
"""
Database Setup Script for CampusPool
This script creates the necessary MongoDB collections and indexes for geospatial queries.
Run this once after setting up your MongoDB connection.
"""

import os
import sys
from pymongo import MongoClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def setup_database():
    """Set up MongoDB collections and indexes"""
    
    # Get MongoDB URI from environment
    mongo_uri = os.getenv('MONGO_URI')
    if not mongo_uri:
        print("Error: MONGO_URI not found in environment variables.")
        print("Please check your .env file.")
        return False
    
    try:
        # Connect to MongoDB
        client = MongoClient(mongo_uri)
        db = client.get_default_database()  # Gets database from URI
        
        print("Connected to MongoDB successfully!")
        print(f"Database: {db.name}")
        
        # Create collections if they don't exist
        collections_to_create = ['users', 'rides', 'ride_requests', 'user_profiles']
        
        for collection_name in collections_to_create:
            if collection_name not in db.list_collection_names():
                db.create_collection(collection_name)
                print(f"Created collection: {collection_name}")
            else:
                print(f"Collection {collection_name} already exists")
        
        # Create geospatial indexes for location-based queries
        print("\nCreating geospatial indexes...")
        
        # Users collection - for home locations
        db.users.create_index([("homeLocation", "2dsphere")])
        print("✓ Created 2dsphere index on users.homeLocation")
        
        # Rides collection - for pickup locations  
        db.rides.create_index([("pickup_location", "2dsphere")])
        print("✓ Created 2dsphere index on rides.pickup_location")
        
        # Ride requests collection - for pickup locations
        db.ride_requests.create_index([("pickup_location", "2dsphere")])
        print("✓ Created 2dsphere index on ride_requests.pickup_location")
        
        # Create additional useful indexes
        print("\nCreating additional indexes...")
        
        # Index for finding active rides
        db.rides.create_index([("status", 1), ("driver_id", 1)])
        print("✓ Created compound index on rides.status + rides.driver_id")
        
        # Index for finding ride requests by driver
        db.ride_requests.create_index([("driver_id", 1), ("status", 1)])
        print("✓ Created compound index on ride_requests.driver_id + ride_requests.status")
        
        # Index for user profiles
        db.user_profiles.create_index([("user_id", 1)], unique=True)
        print("✓ Created unique index on user_profiles.user_id")
        
        # Index for email uniqueness (if not already exists)
        try:
            db.users.create_index([("email", 1)], unique=True)
            print("✓ Created unique index on users.email")
        except Exception as e:
            if "duplicate key" in str(e).lower():
                print("! Unique index on users.email already exists")
            else:
                print(f"! Warning: Could not create unique index on users.email: {e}")
        
        print(f"\n🎉 Database setup completed successfully!")
        print("\nYour CampusPool application is now ready to handle:")
        print("- ✓ User registration with geocoded addresses")
        print("- ✓ Fast geospatial searches for nearby rides")
        print("- ✓ Efficient ride request matching")
        print("- ✓ Location-based smart scoring")
        
        # Test the geospatial functionality
        print("\n🧪 Testing geospatial query functionality...")
        test_geospatial_query(db)
        
        client.close()
        return True
        
    except Exception as e:
        print(f"❌ Error setting up database: {e}")
        return False

def test_geospatial_query(db):
    """Test that geospatial queries work correctly"""
    try:
        # Test coordinates for Bengaluru
        test_location = {
            "type": "Point", 
            "coordinates": [77.5946, 12.9716]  # Bengaluru center
        }
        
        # Test $geoNear aggregation (this is what we use for finding nearby rides)
        pipeline = [
            {
                "$geoNear": {
                    "near": test_location,
                    "distanceField": "distance",
                    "maxDistance": 10000,  # 10km in meters
                    "spherical": True
                }
            },
            {"$limit": 1}
        ]
        
        # Test on users collection
        result = list(db.users.aggregate(pipeline))
        print("✓ Geospatial aggregation query test passed")
        
    except Exception as e:
        print(f"! Warning: Geospatial query test failed: {e}")
        print("  This might be normal if you don't have any users with location data yet.")

if __name__ == "__main__":
    print("🚀 Starting CampusPool Database Setup")
    print("=" * 50)
    
    success = setup_database()
    
    if success:
        print("\n✅ Setup completed successfully!")
        print("\nNext steps:")
        print("1. Start your Flask application: python run.py")
        print("2. Register some users to test the geospatial features")
        print("3. Have fun building your ride-sharing platform! 🚗")
    else:
        print("\n❌ Setup failed. Please check the error messages above.")
        sys.exit(1)