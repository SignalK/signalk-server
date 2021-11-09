import geoJSON from 'geojson-validation';

export const validate= {
    resource: (type:string, value:any):boolean=> {
        if(!type) { return false }
        switch(type) {
            case 'routes':
                return validateRoute(value);
                break
            case 'waypoints':
                return validateWaypoint(value)
                break
            case 'notes':
                return validateNote(value)
                break;  
            case 'regions':
                return validateRegion(value)
                break                
            default:
                return true            
        }  
    },

    // ** returns true if id is a valid Signal K UUID **
    uuid: (id:string): boolean=> {
        let uuid= RegExp("^urn:mrn:signalk:uuid:[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-4[0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$")
        return uuid.test(id)
    }
}

// ** validate route data
const validateRoute= (r:any):boolean=> {   
    //if(typeof r.name === 'undefined') { return false }
    //if(typeof r.description === 'undefined') { return false }
    if(typeof r.distance === 'undefined' || typeof r.distance !=='number') { return false }
    if(r.start) {
        let l= r.start.split('/')
        if(!validate.uuid(l[l.length-1])) { return false }
    }
    if(r.end) {
        let l= r.end.split('/')
        if(!validate.uuid(l[l.length-1])) { return false }
    }
    try {
        if(!r.feature || !geoJSON.valid(r.feature)) { 
            return false
        }
        if(r.feature.geometry.type!=='LineString') { return false }
    }
    catch(err) { return false }
    return true
}

// ** validate waypoint data
const validateWaypoint= (r:any):boolean=> { 
    if(typeof r.position === 'undefined') { return false } 
    if(typeof r.position.latitude === 'undefined' || typeof r.position.longitude === 'undefined') { 
        return false 
    }
    if(typeof r.position.latitude !== 'number' || typeof r.position.longitude !== 'number') { 
        return false 
    } 
    try {
        if(!r.feature || !geoJSON.valid(r.feature)) { 
            return false
        }
        if(r.feature.geometry.type!=='Point') { return false }
    }
    catch(e) { return false }
    return true
}

// ** validate note data
const validateNote= (r:any):boolean=> {  
    if(!r.region && !r.position && !r.geohash ) { return false } 
    if(typeof r.position!== 'undefined') {
        if(typeof r.position.latitude === 'undefined' || typeof r.position.longitude === 'undefined') { 
            return false 
        }
        if(typeof r.position.latitude !== 'number' || typeof r.position.longitude !== 'number') { 
            return false 
        } 
    }
    if(r.region) {
        let l= r.region.split('/')
        if(!validate.uuid(l[l.length-1])) { return false }
    }
    return true
}

// ** validate region data
const validateRegion= (r:any):boolean=> {  
    if(!r.geohash && !r.feature) { return false } 
    if(r.feature ) {
        try {
            if(!geoJSON.valid(r.feature)) { return false }
            if(r.feature.geometry.type!=='Polygon' && r.feature.geometry.type!=='MultiPolygon') { 
                return false
            }
        }
        catch(e) { return false }
    }
    return true
}

