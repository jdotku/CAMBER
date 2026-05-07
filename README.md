# CAMBER - Supply Chain Risk Intelligence Platform

A modern B2B SaaS platform that analyzes Bills of Materials (BOMs) for geopolitical, environmental, and supply chain risks.

## Features

- **BOM Analysis**: Upload CSV, get instant risk assessment
- **Risk Scoring**: AI-powered health scoring (Green/Yellow/Red)
- **Supply Network Visualization**: See your supplier concentration
- **Spec-Match Engine**: Find pin-compatible alternatives in lower-risk regions
- **News Integration**: Real-time news data informing risk scores
- **Claude AI Integration**: Intelligent analysis and recommendations

## Tech Stack

- **Frontend**: React 18
- **Backend**: Node.js + Express
- **APIs**: Anthropic Claude, NewsAPI
- **Deployment**: Netlify (frontend), Heroku (backend)

## Getting Started

### Prerequisites
- Node.js 16+
- npm or yarn
- API keys: Anthropic, NewsAPI

### Installation

```bash
# Clone the repo
git clone https://github.com/jdotku/CAMBER.git
cd CAMBER

# Install backend dependencies
cd backend
npm install
cp .env.example .env
# Add your API keys to .env

# Start backend
npm start

# In a new terminal, install frontend dependencies
cd ../frontend
npm install

# Start frontend
npm start
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. **Upload BOM**: Drop a CSV with your parts list
2. **Get Instant Analysis**: See health score + key risks
3. **Explore Deeper**: Switch to advanced mode for detailed analysis
4. **Find Alternatives**: Get AI-recommended part swaps
5. **Export Report**: Download PDF for stakeholders

## API Endpoints

### Health Analysis
- `POST /api/bom-health` - Get health score and issue summary
- `POST /api/bom-analyze` - Claude AI analysis of BOM

### BOM Management
- `POST /api/parse-bom` - Parse and enrich BOM with geo data
- `GET /api/health` - Health check

### Advanced Analysis
- `POST /api/claude-part-analysis` - Analyze specific part
- `POST /api/claude-network-analysis` - Analyze supply network
- `GET /api/news/:country` - Get news for a country

## Roadmap

- [ ] Supplier scorecard system
- [ ] Historical BOM comparisons
- [ ] Lead time prediction with ML
- [ ] Supplier communication portal
- [ ] Compliance checker (ITAR, etc.)
- [ ] Mobile app

## Cost Notes

- **Claude API**: ~$0.01-0.02 per BOM analysis
- **NewsAPI**: Free tier (100 requests/day)
- Monthly cost at scale: ~$20-50 for AI analysis

## Author

**Javin** - Junior at UC Berkeley Haas School of Business
- Email: javin@berkeley.edu
- LinkedIn: [linkedin.com/in/javinku](https://www.linkedin.com/in/javin-ku-059590299/?skipRedirect=true)
- GitHub: github.com/jdotku

## License

MIT License - feel free to use this for your own supply chain projects

## Support

Found a bug? Have a feature request? Open an issue!

---

**Made with ❤️ for hardware PMs and procurement specialists**
