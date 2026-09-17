-- ============================================================
-- ShivaTechDigital Pricing Master
-- ============================================================

INSERT INTO pricing_master
    (category, service, description, base_price, unit)
VALUES

-- Website
('Website', 'Landing Page',
 'Single professional landing page',
 10000, 'project'),

('Website', 'Business Website',
 'Corporate/business website',
 35000, 'project'),

('Website', 'E-Commerce Website',
 'Complete e-commerce website',
 70000, 'project'),

('Website', 'Admin Panel',
 'Web-based admin dashboard',
 20000, 'project'),

-- Mobile App
('Mobile App', 'Flutter Application',
 'Cross-platform Flutter mobile application',
 60000, 'project'),

('Mobile App', 'Customer App',
 'Customer-facing mobile application',
 50000, 'project'),

('Mobile App', 'Admin App',
 'Administrative mobile application',
 25000, 'project'),

-- Integrations
('Integration', 'Razorpay Payment Gateway',
 'Razorpay payment gateway integration',
 5000, 'integration'),

('Integration', 'WhatsApp Integration',
 'WhatsApp API integration',
 7500, 'integration'),

('Integration', 'Google Maps Integration',
 'Google Maps/location integration',
 5000, 'integration'),

-- SEO
('SEO', 'Initial SEO Setup',
 'Technical and on-page SEO setup',
 10000, 'project'),

('SEO', 'Monthly SEO',
 'Monthly SEO service',
 15000, 'month'),

-- Cloud
('Cloud', 'Deployment',
 'Production deployment and configuration',
 5000, 'project'),

('Cloud', 'AWS/Azure Setup',
 'Cloud infrastructure setup',
 10000, 'project'),

-- Design
('Design', 'UI/UX Design',
 'UI/UX design for web or application',
 15000, 'project'),

-- Other
('Other', 'Testing & QA',
 'Application testing and quality assurance',
 5000, 'project'),

('Other', 'Maintenance',
 'Monthly maintenance and support',
 10000, 'month');
