import requests
import time
import re
import json

def start_crawl_and_get_links(seed_url, max_pages):
    """
    Starts a crawl on the Crawlee API, polls for completion, 
    and returns a cleaned list of product URLs and ASINs.
    """
    base_url = "https://crawlee-3-jqtc.onrender.com"
    crawl_endpoint = f"{base_url}/crawl"
    
    # 1. Start the crawl
    payload = {
        "seed_urls": [seed_url],
        "max_pages": max_pages
    }
    
    try:
        response = requests.post(crawl_endpoint, json=payload, timeout=15)
        
        if response.status_code == 503:
            return {"error": "API Unavailable (503). Server may be overloaded or down."}
        
        response.raise_for_status()
        request_id = response.json().get("request_id")
        
        if not request_id:
            return {"error": "Failed to obtain request_id from API."}
            
        print(f"Crawl started. Request ID: {request_id}")
        
    except requests.exceptions.RequestException as e:
        return {"error": f"Initial request failed: {str(e)}"}

    # 2. Polling for results
    results_endpoint = f"{base_url}/results/{request_id}"
    max_wait = 120  # 2 minutes
    interval = 5
    elapsed = 0
    
    raw_links = []
    
    while elapsed < max_wait:
        try:
            print(f"Polling results... ({elapsed}s elapsed)")
            res = requests.get(results_endpoint, timeout=10)
            
            if res.status_code == 200:
                data = res.json()
                # Assuming data is a list of links or contains a 'links' key
                if isinstance(data, list):
                    raw_links = data
                elif isinstance(data, dict) and "links" in data:
                    raw_links = data["links"]
                
                if raw_links:
                    break
            elif res.status_code == 503:
                 print("Service unavailable during poll, retrying...")
            
            # If 404 or empty, it might still be processing
        except Exception:
            pass
            
        time.sleep(interval)
        elapsed += interval
        
    if not raw_links:
        if elapsed >= max_wait:
            return {"error": "Crawl timed out after 2 minutes."}
        return {"error": "No links found or crawl failed."}

    # 3. Cleaning and Filtering Logic
    cleaned_data = []
    seen_urls = set()
    
    # Product URL Patterns: /dp/, /product/, /gp/product/
    product_pattern = r"/(?:dp|product|gp/product)/([A-Z0-9]{10})"
    
    for link in raw_links:
        # Normalize to https
        if link.startswith("http://"):
            link = "https://" + link[7:]
        elif not link.startswith("https://") and not link.startswith("http"):
             link = "https://" + link
             
        # Remove tracking parameters (? and #)
        base_url_only = link.split('?')[0].split('#')[0].rstrip('/')
        
        # Check if it's a product URL
        match = re.search(product_pattern, base_url_only)
        if match:
            asin = match.group(1)
            
            # Deduplicate
            if base_url_only not in seen_urls:
                cleaned_data.append({
                    "url": base_url_only,
                    "asin": asin
                })
                seen_urls.add(base_url_only)
                
    return cleaned_data

# Example Usage:
if __name__ == "__main__":
    # Test with an Amazon domain
    target_seed = "https://www.amazon.com/s?k=headphones"
    results = start_crawl_and_get_links(target_seed, max_pages=10)
    
    if isinstance(results, dict) and "error" in results:
        print(f"FAILED: {results['error']}")
    else:
        print(f"Successfully extracted {len(results)} cleaned product links:")
        print(json.dumps(results, indent=2))
